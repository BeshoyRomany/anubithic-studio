//background -> api/anthropic/background/route
import { inngest } from "@/inngest/client";

export async function POST() {
  await inngest.send({
    name: "anthropic-generate", //event name
    data: {},
  });
  //return the response as json
  return Response.json({ status: "started" });
}
