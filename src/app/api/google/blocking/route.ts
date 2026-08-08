//localhost:3001/api/demo/blocking
// TODO: Authentication is intentionally omitted for local demo/workshop purposes.
import { generateText } from "ai";
import { google } from "@ai-sdk/google";

export async function POST() {
  const response = await generateText({
    model: google("gemini-3.5-flash"),
    prompt: "Write a vegetarian lasagna recipe for 4 people.",
  });

  //return the response as json
  return Response.json({ response });
}
