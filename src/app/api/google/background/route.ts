//background -> api/google/background/route
// TODO: Authentication is intentionally omitted for local demo/workshop purposes.
import { inngest } from "@/inngest/client";

export async function POST() {
  await inngest.send({
    name: "google/generate",
    data: {},
  });
  //return the response as json
  return Response.json({ status: "started" });
}
