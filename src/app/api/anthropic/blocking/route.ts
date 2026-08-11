//localhost:3001/api/demo/blocking
// TODO: Authentication is intentionally omitted for local demo/workshop purposes.
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";

export async function POST() {
  const response = await generateText({
    model: anthropic("claude-haiku-4-5"), //also claude-sonnet-5
    prompt: "Write a vegetarian lasagna recipe for 4 people.",
    experimental_telemetry: {
      isEnabled: true,
      recordInputs: true,
      recordOutputs: true,
    },
  });

  //return the response as json
  return Response.json({ response });
}
