import { z } from "zod";

import { log } from "@/lib/logger";
import { listCalendarEventsWithFallback } from "@/lib/server/calendar";
import { ApiError, errorResponse } from "@/lib/server/http";
import { getRepositoryContext } from "@/lib/server/repository";

export const dynamic = "force-dynamic";

const timestampSchema = z.string().datetime({ offset: true });

function todayRange(): { startAt: string; endAt: string } {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return {
    startAt: new Date(`${date}T00:00:00+09:00`).toISOString(),
    endAt: new Date(`${date}T23:59:59.999+09:00`).toISOString(),
  };
}

export async function GET(request: Request): Promise<Response> {
  const correlationId = `calendar_${crypto.randomUUID()}`;
  try {
    const defaults = todayRange();
    const params = new URL(request.url).searchParams;
    const startAt = params.get("startAt") ?? defaults.startAt;
    const endAt = params.get("endAt") ?? defaults.endAt;
    if (!timestampSchema.safeParse(startAt).success || !timestampSchema.safeParse(endAt).success || Date.parse(endAt) <= Date.parse(startAt)) {
      throw new ApiError(422, "INVALID_DATE_RANGE", "startAt and endAt must be a valid increasing range");
    }
    const context = await getRepositoryContext();
    const calendarResult = await listCalendarEventsWithFallback(
      startAt,
      endAt,
      context.providerAccessToken,
    );
    const events = calendarResult.events;
    await log.info("calendar_events_list", "Calendar events listed", {
      correlationId,
      userId: context.userId,
      context: { range: { start_at: startAt, end_at: endAt }, result_count: events.length },
    });
    return Response.json({
      events,
      connected: !calendarResult.demo,
      demo: context.demo || calendarResult.demo,
    });
  } catch (error) {
    return errorResponse(error, { operation: "calendar_events_list", correlationId, service: "google_calendar" });
  }
}
