import { Inngest } from "inngest";
import { sentryMiddleware } from "@inngest/middleware-sentry";

//create a client to send and receive events
export const inngest = new Inngest({
  id: "anubithic-studio",
  middleware: [sentryMiddleware()],
});
