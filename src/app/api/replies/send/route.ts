import { z } from "zod";

import { log } from "@/lib/logger";
import { ApiError, errorResponse, parseJson } from "@/lib/server/http";
import { createMailChannel } from "@/lib/server/mail";
import { getRepositoryContext } from "@/lib/server/repository";

const inputSchema = z.object({
  messageId: z.string().min(1).max(512),
  draftId: z.string().min(1).max(512).optional(),
  threadId: z.string().min(1).max(512).optional(),
  subject: z.string().max(300).optional(),
  body: z.string().min(1).max(20000),
  approvedByUser: z.literal(true),
});

export async function POST(request: Request): Promise<Response> {
  const correlationId = `send_${crypto.randomUUID()}`;
  try {
    const input = await parseJson(request, inputSchema);
    const context = await getRepositoryContext();
    const message = await context.repository.getMessage(input.messageId);
    if (!message) {
      throw new ApiError(404, "MESSAGE_NOT_FOUND", "Message was not found");
    }
    const threadId = input.threadId ?? message.threadId;
    if (message.channel === "gmail" && !threadId) {
      throw new ApiError(422, "THREAD_ID_REQUIRED", "Gmail replies require a threadId");
    }
    const mail = await createMailChannel(message.channel, context.providerAccessToken);
    const sent = await mail.channel.sendReply({
      messageId: message.externalId,
      threadId,
      to: { name: message.senderName, address: message.senderAddress },
      subject: input.subject ?? message.subject,
      bodyText: input.body,
    });
    if (input.draftId) {
      await context.repository.markReplySent(input.draftId, sent.externalId);
    }
    const settings = await context.repository.getSettings();
    if (settings.markAsRead) {
      await mail.channel.markAsRead(message.externalId);
      await log.info("mark_as_read", "Source mail marked as read", {
        correlationId,
        userId: context.userId,
        context: { mail: { message_id: message.externalId, success: true } },
      });
    }
    await log.info("reply_send", "User-approved reply sent", {
      correlationId,
      userId: context.userId,
      context: {
        mail: {
          message_id: message.externalId,
          thread_id: threadId,
          approved_by_user: true,
        },
        result: { provider_message_id: sent.externalId },
      },
    });
    return Response.json({ sent: true, externalId: sent.externalId, threadId: sent.threadId, demo: context.demo || mail.demo });
  } catch (error) {
    return errorResponse(error, { operation: "reply_send", correlationId, service: "mail" });
  }
}
