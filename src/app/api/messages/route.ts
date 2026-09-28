import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { inngest } from "@/inngest/client";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { convex } from "@/lib/convex-client";

const requestSchema = z.object({
  conversationId: z.string(),
  message: z.string().trim().min(1),
});

export async function POST(request: Request) {
  //protected route auth
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const internalKey = process.env.ANUBITHIC_STUDIO_CONVEX_INTERNAL_KEY;

  if (!internalKey) {
    return NextResponse.json(
      { error: "Internal key not configured" },
      { status: 500 },
    );
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  const { conversationId, message } = parsed.data;

  //Call convex mutation query
  const conversation = await convex.query(api.system.getConversationById, {
    conversationId: conversationId as Id<"conversations">,
    internalKey,
  });

  //check of the conversation exist
  if (!conversation) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 },
    );
  }

  const projectId = conversation.projectId;

  //Owner or active contributor only — the agent edits the project's files
  const role = await convex.query(api.system.getProjectRole, {
    internalKey,
    projectId,
    userId,
  });

  if (!role) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  //Find all processing messages in this project
  const processingMessages = await convex.query(
    api.system.getProcessingMessages,
    {
      internalKey,
      projectId: projectId,
    },
  );

  if (processingMessages.length > 0) {
    //cancel all messages
    await Promise.all(
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
      }),
    );
  }
  // Create user message
  await convex.mutation(api.system.createMessage, {
    internalKey,
    conversationId: conversationId as Id<"conversations">,
    projectId,
    role: "user",
    content: message,
  });

  // 1- Create assistant message placeholder with processing status
  const assistantMessageId = await convex.mutation(api.system.createMessage, {
    internalKey,
    conversationId: conversationId as Id<"conversations">,
    projectId,
    role: "assistant",
    content: "",
    status: "processing",
  });

  //2- Trigger Inngest to process the message
  const event = await inngest.send({
    name: "message/sent",
    //userId = who pays: the agent runs on the SENDER's model and key
    data: {
      messageId: assistantMessageId,
      conversationId,
      projectId,
      message,
      userId,
    },
  });

  //return
  return NextResponse.json({
    success: true,
    eventId: event.ids[0],
    messageId: assistantMessageId,
  });
}
