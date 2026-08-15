import { ApiError, errorResponse } from "@/lib/server/http";
import { getRepositoryContext } from "@/lib/server/repository";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const context = await getRepositoryContext();
    const message = await context.repository.getMessage(id);
    if (!message) {
      throw new ApiError(404, "MESSAGE_NOT_FOUND", "Message was not found");
    }
    return Response.json({ ...message, demo: context.demo });
  } catch (error) {
    return errorResponse(error, { operation: "message_read" });
  }
}
