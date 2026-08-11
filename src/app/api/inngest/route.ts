//dashboard -> api/inngest/route
import { serve } from "inngest/next";

import { inngest } from "@/inngest/client";
import {
  anthropicGenerate,
  demoError,
  googleGenerate,
} from "@/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [googleGenerate, anthropicGenerate, demoError],
});
