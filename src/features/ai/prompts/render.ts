import type { PromptProfile } from "../models";

// A prompt is written once as sections; the profile decides the format.
export interface PromptSection {
  tag: string; // XML tag for Claude, heading name for markdown
  title?: string; // friendlier markdown heading, when the prompt never refers to the tag
  body: string;
  code?: boolean; // raw code/text: fenced in markdown so it can't be read as instructions
  inline?: boolean; // exact whitespace matters (text around the cursor): no added newlines
  attrs?: Record<string, string | number | undefined>;
}

const renderXml = ({ tag, body, inline, attrs }: PromptSection) => {
  const attributes = Object.entries(attrs ?? {})
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ` ${key}="${value}"`)
    .join("");

  return inline
    ? `<${tag}${attributes}>${body}</${tag}>`
    : `<${tag}${attributes}>\n${body}\n</${tag}>`;
};

const renderMarkdownBody = ({ body, code, inline }: PromptSection) => {
  if (inline) return JSON.stringify(body); // quoted, so leading/trailing spaces stay visible
  if (code) return `\`\`\`\n${body}\n\`\`\``;
  return body;
};

const renderMarkdown = (section: PromptSection) => {
  const details = Object.entries(section.attrs ?? {})
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key} ${value}`)
    .join(", ");
  const name = section.title ?? section.tag;
  const heading = details ? `## ${name} (${details})` : `## ${name}`;

  return `${heading}\n${renderMarkdownBody(section)}`;
};

// The coding agent has its own hand-written `local` prompt; editor prompts use markdown for every non-Claude profile.
export const renderSections = (
  profile: PromptProfile,
  sections: PromptSection[],
): string =>
  sections
    .map(profile === "claude" ? renderXml : renderMarkdown)
    .join("\n\n");
