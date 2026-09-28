// npm run ai:check -- --model <registry id | ollama/<name>> [--profile claude|markdown|local|reasoner]
//                     [--only agent|edit|suggest] [--verbose]
//
// Runs fixed tasks for the three AI features against one model, through the SAME prompts
// and model builders the app uses (src/features/ai), minus Clerk, Inngest and the proxy.
// Agent tasks run on an in-memory fake project: nothing real is touched.
// Keys come from .env.local (ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY); Ollama from OLLAMA_BASE_URL.

import { createAgent, createNetwork, createTool } from "@inngest/agent-kit";
import { generateText, Output } from "ai";
import { z } from "zod";

import {
  DEFAULT_MODEL_ID,
  DEFAULT_OLLAMA_URL,
  getModelDefinition,
  LOCAL_MODEL_PREFIX,
  localModelDefinition,
  type ModelDefinition,
  type PromptProfile,
} from "../src/features/ai/models";
import { buildCodingAgentPrompt } from "../src/features/ai/prompts/coding-agent";
import {
  buildQuickEditPrompt,
  buildSuggestionPrompt,
} from "../src/features/ai/prompts/editor";
import {
  buildAgentModel,
  createLanguageModel,
} from "../src/features/ai/server/resolve-model";
import { cleanCodeOutput, stripThinking } from "../src/features/ai/utils/clean-output";
import { stripUnsupportedAnthropicBlocks } from "../src/features/ai/server/anthropic-compat";
import {
  attachSignatures,
  createMemorySignatureStore,
  rememberSignatures,
} from "../src/features/ai/server/gemini-signatures";
import { quickEditAISchema } from "../src/features/editor/schemas/quick-edit-schema";
import { SuggestionAIResponseSchema } from "../src/features/editor/schemas/suggestion-schema";

//#region CLI
const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : undefined;
};
const modelId = arg("model") ?? DEFAULT_MODEL_ID;
const only = arg("only");
const verbose = process.argv.includes("--verbose");
const TASK_TIMEOUT_MS = 5 * 60_000;

const definition: ModelDefinition | undefined = modelId.startsWith(LOCAL_MODEL_PREFIX)
  ? localModelDefinition(modelId.slice(LOCAL_MODEL_PREFIX.length), true)
  : getModelDefinition(modelId);

if (!definition) {
  console.error(`Unknown model "${modelId}". Use a registry id or ollama/<name>.`);
  process.exit(1);
}

const profile = (arg("profile") as PromptProfile | undefined) ?? definition.promptProfile;

const credentials = (() => {
  switch (definition.provider) {
    case "anthropic":
      return { apiKey: process.env.ANTHROPIC_API_KEY ?? "" };
    case "openai":
      return { apiKey: process.env.OPENAI_API_KEY ?? "" };
    case "google":
      return { apiKey: process.env.GOOGLE_API_KEY ?? "" };
    case "ollama": {
      const url = (process.env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_URL).replace(/\/$/, "");
      return { apiKey: "ollama", baseUrl: `${url}/v1` };
    }
    default:
      return { apiKey: "" };
  }
})();

if (!credentials.apiKey) {
  console.error(`No key for ${definition.provider} in .env.local`);
  process.exit(1);
}
//#endregion

// Anthropic agent calls skip our proxy here, so apply its response cleanup in-process
if (definition.provider === "anthropic") {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await realFetch(input, init);
    if (!String(input).includes("api.anthropic.com/v1/messages") || !response.ok) {
      return response;
    }
    const text = stripUnsupportedAnthropicBlocks(await response.text());
    return new Response(text, { status: response.status, headers: response.headers });
  }) as typeof fetch;
}

// Gemini agent calls skip our proxy here, so apply its thought-signature fix in-process
if (definition.provider === "google") {
  const store = createMemorySignatureStore();
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.includes(":generateContent") || typeof init?.body !== "string") {
      return realFetch(input, init);
    }
    const response = await realFetch(input, {
      ...init,
      body: await attachSignatures(init.body, "ai-check", store),
    });
    const text = await response.text();
    if (response.ok) await rememberSignatures(text, "ai-check", store);
    return new Response(text, { status: response.status, headers: response.headers });
  }) as typeof fetch;
}

//#region In-memory project + the agent's tools (same names and rules as the real ones)
interface FakeFile {
  id: string;
  name: string;
  type: "file" | "folder";
  parentId: string | null;
  content?: string;
}

const createProject = (files: Omit<FakeFile, "id">[]) => {
  let nextId = 1;
  const items: FakeFile[] = files.map((file) => ({ ...file, id: `f${nextId++}` }));
  const toolCalls: string[] = [];

  const add = (item: Omit<FakeFile, "id">) => {
    if (item.name.includes("/")) throw new Error(`Names can't contain "/": ${item.name}`);
    const created = { ...item, id: `f${nextId++}` };
    items.push(created);
    return created;
  };
  const parent = (parentId: string) => (parentId === "" ? null : parentId);

  const tools = [
    createTool({
      name: "listFiles",
      description:
        "List all files and folders in the project. Returns names, IDs, types, and parentId for each item. Items with parentId: null are at root level.",
      parameters: z.object({}),
      handler: async () => {
        toolCalls.push("listFiles");
        return items.map(({ id, name, type, parentId }) => ({ id, name, type, parentId }));
      },
    }),
    createTool({
      name: "readFiles",
      description: "Read the content of files from the project. Returns file contents.",
      parameters: z.object({ fileIds: z.array(z.string()).describe("Array of file IDs to read") }),
      handler: async ({ fileIds }) => {
        toolCalls.push("readFiles");
        return fileIds.map((id) => {
          const file = items.find((item) => item.id === id);
          return file ? { id, name: file.name, content: file.content } : { id, error: "Not found" };
        });
      },
    }),
    createTool({
      name: "updateFile",
      description: "Update the content of an existing file",
      parameters: z.object({
        fileId: z.string().describe("The ID of the file to update"),
        content: z.string().describe("The new content for the file"),
      }),
      handler: async ({ fileId, content }) => {
        toolCalls.push("updateFile");
        const file = items.find((item) => item.id === fileId && item.type === "file");
        if (!file) return { error: `No file with ID ${fileId}` };
        file.content = content;
        return { success: true };
      },
    }),
    createTool({
      name: "createFiles",
      description:
        "Create multiple files at once in the same folder. Use empty string for parentId at root level.",
      parameters: z.object({
        parentId: z.string().describe("The ID of the parent folder, or empty string for root"),
        files: z.array(z.object({ name: z.string(), content: z.string() })),
      }),
      handler: async ({ parentId, files }) => {
        toolCalls.push("createFiles");
        try {
          return files.map((file) =>
            add({ name: file.name, type: "file", parentId: parent(parentId), content: file.content }),
          );
        } catch (error) {
          return { error: (error as Error).message };
        }
      },
    }),
    createTool({
      name: "createFolder",
      description: "Create a new folder in the project",
      parameters: z.object({
        name: z.string().describe("The name of the folder to create"),
        parentId: z.string().describe("The ID (not name!) of the parent folder, or empty string for root"),
      }),
      handler: async ({ name, parentId }) => {
        toolCalls.push("createFolder");
        try {
          return add({ name, type: "folder", parentId: parent(parentId) });
        } catch (error) {
          return { error: (error as Error).message };
        }
      },
    }),
  ];

  const fileAt = (path: string) => {
    let parentId: string | null = null;
    let found: FakeFile | undefined;
    for (const part of path.split("/")) {
      found = items.find((item) => item.parentId === parentId && item.name === part);
      if (!found) return undefined;
      parentId = found.id;
    }
    return found;
  };

  return { items, tools, toolCalls, fileAt };
};
//#endregion

//#region Tasks
interface TaskResult {
  pass: boolean;
  note: string;
}

const runAgent = async (
  project: ReturnType<typeof createProject>,
  prompt: string,
): Promise<string> => {
  const agent = createAgent({
    name: "anubithic-studio",
    system: buildCodingAgentPrompt(profile, ""),
    model: buildAgentModel(definition, credentials, { maxTokens: 8000, temperature: 0.3 }),
    tools: project.tools,
  });
  // Same stopping rule as process-message.ts
  const network = createNetwork({
    name: "ai-check",
    agents: [agent],
    maxIter: 20,
    router: ({ network }) => {
      const last = network.state.results.at(-1);
      const text = last?.output.some((m) => m.type === "text" && m.role === "assistant");
      const tools = last?.output.some((m) => m.type === "tool_call");
      if (last && !tools) return undefined;
      return text && !tools ? undefined : agent;
    },
  });
  const result = await network.run(prompt);
  const message = result.state.results.at(-1)?.output.find((m) => m.type === "text");
  const content =
    message?.type === "text"
      ? typeof message.content === "string"
        ? message.content
        : message.content.map((c) => c.text).join("")
      : "";
  return stripThinking(content);
};

const editWith = async (selectedCode: string, instruction: string, fullCode = selectedCode) => {
  const { output } = await generateText({
    model: createLanguageModel(definition, { baseUrl: "", ...credentials }),
    output: Output.object({ schema: quickEditAISchema }),
    prompt: buildQuickEditPrompt(profile, { selectedCode, fullCode, instruction }),
  });
  return cleanCodeOutput(output.editedCode);
};

const suggestWith = async (request: Parameters<typeof buildSuggestionPrompt>[1]) => {
  const { output } = await generateText({
    model: createLanguageModel(definition, { baseUrl: "", ...credentials }),
    output: Output.object({ schema: SuggestionAIResponseSchema }),
    prompt: buildSuggestionPrompt(profile, request),
  });
  return cleanCodeOutput(output.suggestion);
};

const TASKS: { group: "agent" | "edit" | "suggest"; name: string; run: () => Promise<TaskResult> }[] = [
  {
    group: "agent",
    name: "read a file and answer",
    run: async () => {
      const project = createProject([
        { name: "index.html", type: "file", parentId: null, content: "<h1>Hi</h1>" },
        { name: "app.js", type: "file", parentId: null, content: "console.log('secret-42');" },
      ]);
      const answer = await runAgent(project, "What exact string does app.js log? Answer with just the string.");
      const read = project.toolCalls.includes("readFiles");
      return {
        pass: read && answer.includes("secret-42"),
        note: read ? `answered: ${answer.slice(0, 60)}` : "never called readFiles (guessed)",
      };
    },
  },
  {
    group: "agent",
    name: "edit an existing file",
    run: async () => {
      const project = createProject([
        {
          name: "app.js",
          type: "file",
          parentId: null,
          content: "function greet(name) {\n  return 'Hi ' + name;\n}\n\nconsole.log(greet('Bo'));\n",
        },
      ]);
      await runAgent(project, "In app.js, rename the function greet to sayHello everywhere. Change nothing else.");
      const content = project.fileAt("app.js")?.content ?? "";
      const renamed = (content.match(/sayHello/g) ?? []).length >= 2 && !/\bgreet\b/.test(content);
      return {
        pass: renamed && content.includes("'Hi ' + name"),
        note: renamed ? "renamed via updateFile" : `app.js now: ${content.replace(/\n/g, " ").slice(0, 70)}`,
      };
    },
  },
  {
    group: "agent",
    name: "create files in the right folders",
    run: async () => {
      const project = createProject([]);
      await runAgent(
        project,
        "Create a minimal static site: index.html at the project root with <h1>Hello</h1>, and a folder named src containing style.css that makes the h1 red. Link the CSS from index.html.",
      );
      const html = project.fileAt("index.html")?.content ?? "";
      const css = project.fileAt("src/style.css")?.content ?? "";
      const problems = [
        !html && "no index.html at root",
        html && !/<h1/i.test(html) && "no <h1>",
        html && !html.includes("style.css") && "CSS not linked",
        !css && "no src/style.css",
        css && !/red|#f00|#ff0000/i.test(css) && "h1 not red",
        project.items.some((item) => item.name.includes("/")) && "used a path as a name",
      ].filter(Boolean);
      return { pass: problems.length === 0, note: problems.join(", ") || "layout correct" };
    },
  },
  {
    group: "edit",
    name: "convert to arrow function",
    run: async () => {
      const out = await editWith("function add(a, b) {\n  return a + b;\n}", "Convert this to an arrow function assigned to a const");
      return { pass: out.includes("=>") && /const\s+add/.test(out) && !out.includes("```"), note: out.replace(/\n/g, " ").slice(0, 70) };
    },
  },
  {
    group: "edit",
    name: "rename a variable",
    run: async () => {
      const out = await editWith("const x = items.length;\nconsole.log(x);", "Rename x to count");
      return { pass: out.includes("count") && !/\bx\b/.test(out), note: out.replace(/\n/g, " ").slice(0, 70) };
    },
  },
  {
    group: "suggest",
    name: "complete a useState pair",
    run: async () => {
      const out = await suggestWith({
        fileName: "toggle.tsx",
        code: "import { useState } from 'react';\n\nexport const Toggle = () => {\n  const [isOpen\n};",
        previousLines: "import { useState } from 'react';\n\nexport const Toggle = () => {",
        currentLine: "  const [isOpen",
        textBeforeCursor: "  const [isOpen",
        textAfterCursor: "",
        nextLines: "};",
        lineNumber: 4,
      });
      return { pass: out.includes("setIsOpen"), note: JSON.stringify(out).slice(0, 70) };
    },
  },
  {
    group: "suggest",
    name: "finish a return line",
    run: async () => {
      const out = await suggestWith({
        fileName: "sum.js",
        code: "function sum(a, b) {\n  return \n}",
        previousLines: "function sum(a, b) {",
        currentLine: "  return ",
        textBeforeCursor: "  return ",
        textAfterCursor: "",
        nextLines: "}",
        lineNumber: 2,
      });
      return { pass: /a\s*\+\s*b/.test(out) && !out.includes("return"), note: JSON.stringify(out).slice(0, 70) };
    },
  },
  {
    group: "suggest",
    name: "stay quiet when code is complete",
    run: async () => {
      const out = await suggestWith({
        fileName: "cart.js",
        code: "const total = price * qty;\nconsole.log(total);",
        previousLines: "",
        currentLine: "const total = price * qty;",
        textBeforeCursor: "const total = price * qty;",
        textAfterCursor: "",
        nextLines: "console.log(total);",
        lineNumber: 1,
      });
      return { pass: out.trim() === "", note: JSON.stringify(out).slice(0, 70) };
    },
  },
];
//#endregion

//#region Run
const withTimeout = <T,>(promise: Promise<T>) =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`timed out after ${TASK_TIMEOUT_MS / 60_000} min`)), TASK_TIMEOUT_MS),
    ),
  ]);

console.log(`\nModel: ${definition.id}   Prompt profile: ${profile}\n`);
if (definition.provider === "ollama") {
  console.log("Tip: start Ollama with OLLAMA_CONTEXT_LENGTH=32768 or agent prompts get cut off.\n");
}

let passed = 0;
const selected = TASKS.filter((task) => !only || task.group === only);

for (const task of selected) {
  const started = Date.now();
  process.stdout.write(`  ${task.group.padEnd(7)} ${task.name.padEnd(34)} `);
  let result: TaskResult;
  try {
    result = await withTimeout(task.run());
  } catch (error) {
    result = { pass: false, note: `error: ${String((error as Error).message ?? error).slice(0, 80)}` };
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(1).padStart(5);
  if (result.pass) passed++;
  console.log(`${result.pass ? "PASS" : "FAIL"} ${seconds}s  ${verbose || !result.pass ? result.note : ""}`);
}

console.log(`\n${passed}/${selected.length} passed\n`);
process.exit(passed === selected.length ? 0 : 1);
//#endregion
