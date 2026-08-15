import { z } from "zod";

import { log } from "@/lib/logger";
import { errorResponse } from "@/lib/server/http";
import { getRepositoryContext } from "@/lib/server/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const correlationId = `activity_${crypto.randomUUID()}`;
  try {
    const params = new URL(request.url).searchParams;
    const parsedLimit = z.coerce.number().int().min(1).max(100).catch(50).parse(params.get("limit") ?? 50);
    const requestedCorrelationId = params.get("correlationId") ?? undefined;
    const context = await getRepositoryContext();
    const activities = await context.repository.listActivities(parsedLimit, requestedCorrelationId);
    await log.info("activity_list", "Activity history listed", {
      correlationId,
      userId: context.userId,
      context: { result_count: activities.length, limit: parsedLimit },
    });
    const grouped = Object.values(
      activities.reduce<Record<string, { correlationId: string; entries: typeof activities }>>((groups, entry) => {
        const key = entry.correlationId ?? `single_${entry.id}`;
        groups[key] ??= { correlationId: key, entries: [] };
        groups[key].entries.push(entry);
        return groups;
      }, {}),
    );
    return Response.json({ activities, groups: grouped, demo: context.demo });
  } catch (error) {
    return errorResponse(error, { operation: "activity_list", correlationId });
  }
}
