import { z } from "zod";

import { errorResponse, parseOptionalJson } from "@/lib/server/http";
import { fetchAndTriageMail } from "@/lib/server/mail/service";
import { getRepositoryContext } from "@/lib/server/repository";

const inputSchema = z.object({
  channel: z.enum(["gmail", "xserver"]).default("gmail"),
  fetchRange: z.enum(["latest_100", "last_5_days"]).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export async function POST(request: Request): Promise<Response> {
  const correlationId = `chk_${crypto.randomUUID()}`;
  try {
    const input = await parseOptionalJson(request, inputSchema);
    const context = await getRepositoryContext();
    const settings = await context.repository.getSettings();
    const result = await fetchAndTriageMail({
      repository: context.repository,
      channelName: input.channel,
      providerAccessToken: context.providerAccessToken,
      fetchRange: input.fetchRange ?? settings.fetchRange,
      limit: input.limit,
      correlationId,
      userId: context.userId,
    });
    return Response.json(result);
  } catch (error) {
    return errorResponse(error, {
      operation: "api_error",
      correlationId,
      service: "mail",
    });
  }
}
