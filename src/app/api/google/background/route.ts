//background -> api/google/background/route
import { inngest } from "@/inngest/client";

export async function POST() {
  await inngest.send({
    name: "google/generate",
    data: {},
  });
  //return the response as json
  return Response.json({ status: "started" });
}

await inngest.send({ name: "google/generate", data: {} });
