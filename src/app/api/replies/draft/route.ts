import { z } from "zod";

import { log } from "@/lib/logger";
import { anthropic } from "@/lib/server/anthropic";
import { ApiError, errorResponse, parseJson } from "@/lib/server/http";
import { getRepositoryContext } from "@/lib/server/repository";

const inputSchema = z.object({
  messageId: z.string().min(1).max(512),
  instruction: z.string().max(1000).optional(),
});

export async function POST(request: Request): Promise<Response> {
  const correlationId = `reply_${crypto.randomUUID()}`;
  try {
    const input = await parseJson(request, inputSchema);
    const context = await getRepositoryContext();
    const message = await context.repository.getMessage(input.messageId);
    if (!message) {
      throw new ApiError(404, "MESSAGE_NOT_FOUND", "Message was not found");
    }
    const style = await context.repository.getStyleProfile();
    const generated = await anthropic.draftReply({
      subject: message.subject,
      bodyText: message.bodyText,
      summary: message.snippet,
      style,
      instruction: input.instruction,
    });
    const draft = await context.repository.saveReplyDraft(
      message.id,
      generated.data.subject,
      generated.data.bodyText,
    );
    await log.info("reply_draft_generate", "Reply draft generated", {
      correlationId,
      userId: context.userId,
      context: {
        mail: { message_id: message.externalId },
        ai: {
          model: generated.model,
          tokens_in: generated.tokensIn,
          tokens_out: generated.tokensOut,
        },
        draft: { draft_id: draft.id },
      },
    });
    return Response.json({
      draftId: draft.id,
      subject: draft.subject,
      draft: draft.bodyText,
      demo: context.demo || generated.demo,
    });
  } catch (error) {
    return errorResponse(error, { operation: "reply_draft_generate", correlationId });
  }
}
