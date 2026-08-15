import { log } from "@/lib/logger";
import { ApiError, errorResponse } from "@/lib/server/http";
import { createMailChannel } from "@/lib/server/mail";
import { getRepositoryContext } from "@/lib/server/repository";

async function complete(params: Promise<{ id: string }>): Promise<Response> {
  const correlationId = `task_${crypto.randomUUID()}`;
  try {
    const { id } = await params;
    const context = await getRepositoryContext();
    const task = await context.repository.completeTask(id);
    if (!task) {
      throw new ApiError(404, "TASK_NOT_FOUND", "Task could not be completed");
    }
    await log.info("task_complete", "Task completed", {
      correlationId,
      userId: context.userId,
      context: {
        task: { task_id: task.id, elapsed_min: task.elapsedMinutes ?? 0 },
      },
    });
    const settings = await context.repository.getSettings();
    if (settings.markAsRead && task.messageId) {
      const message = await context.repository.getMessage(task.messageId);
      if (message) {
        const mail = await createMailChannel(message.channel, context.providerAccessToken);
        await mail.channel.markAsRead(message.externalId);
        await log.info("mark_as_read", "Source mail marked as read", {
          correlationId,
          userId: context.userId,
          context: { mail: { message_id: message.externalId, success: true } },
        });
      }
    }
    return Response.json({ task, demo: context.demo });
  } catch (error) {
    return errorResponse(error, { operation: "task_complete", correlationId });
  }
}

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return complete(params);
}

export const POST = PATCH;
