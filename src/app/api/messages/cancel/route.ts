import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { inngest } from "@/inngest/client";
import { convex } from "@/lib/convex-client";

import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";

// Ensure only one message is actively processing per project
// to prevent accidental token overspending and race conditions.
const requestSchema = z.object({
  projectId: z.string(),
});

export async function POST(request: Request) {
  const { userId } = await auth();

  //protect the route -> with user authentication
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  //extract the body from the request
  const body = await request.json();

  //extract the projectId after validating the body with zod
  const { projectId } = requestSchema.parse(body);

  //protect the request with internalKey
  const internalKey = process.env.ANUBITHIC_STUDIO_CONVEX_INTERNAL_KEY!;

  if (!internalKey) {
    return NextResponse.json(
      { error: "Internal key not configured" },
      { status: 500 },
    );
  }

  //Find all processing messages in this project
  //every time the user hit "Cancel endpoint" we gonna cancel each single message we currently processing
  const processingMessages = await convex.query(
    api.system.getProcessingMessages,
    {
      internalKey,
      projectId: projectId as Id<"projects">,
    },
  );

  if (processingMessages.length === 0) {
    return NextResponse.json({ success: true, cancelled: false });
  }

  //else Cancel all processing messages -> each message.status === "processing"

  //if a message has a processing status it must have a running background job.
  //Because the only way a message can stop having a processing status is after inngest -> "processMessage" function actually finishes & update the "assistant message" in the database
  const cancelledIds = Promise.all(
    processingMessages.map(async (msg) => {
      await inngest.send({
        name: "message/cancel",
        data: {
          messageId: msg._id,
        },
      });

      await convex.mutation(api.system.updateMessageStatus, {
        internalKey,
        messageId: msg._id,
        status: "cancelled",
      });

      return msg._id;
    }),
  );

  //return all the cancel Ids array[]
  return NextResponse.json({
    success: true,
    cancelled: true,
    messageIds: cancelledIds,
  });
}
