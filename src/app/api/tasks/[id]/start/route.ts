import { log } from "@/lib/logger";
import { ApiError, errorResponse } from "@/lib/server/http";
import { getRepositoryContext } from "@/lib/server/repository";

async function start(params: Promise<{ id: string }>): Promise<Response> {
  const correlationId = `task_${crypto.randomUUID()}`;
  try {
    const { id } = await params;
    const context = await getRepositoryContext();
    const task = await context.repository.startTask(id);
    if (!task) {
      throw new ApiError(404, "TASK_NOT_FOUND", "Task could not be started");
    }
    await log.info("task_start", "Task started", {
      correlationId,
      userId: context.userId,
      context: { task: { task_id: task.id } },
    });
    return Response.json({ task, demo: context.demo });
  } catch (error) {
    return errorResponse(error, { operation: "task_start", correlationId });
  }
}

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return start(params);
}

export const POST = PATCH;
