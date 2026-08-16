import { z } from "zod";

import { log } from "@/lib/logger";
import { createCalendarClient } from "@/lib/server/calendar";
import { ApiError, errorResponse, parseJson } from "@/lib/server/http";
import { getRepositoryContext } from "@/lib/server/repository";

const inputSchema = z
  .object({
    messageId: z.string().min(1).max(512).optional(),
    title: z.string().min(1).max(300),
    startAt: z.string().datetime({ offset: true }),
    endAt: z.string().datetime({ offset: true }),
    timezone: z.string().min(1).max(100).default("Asia/Tokyo"),
    location: z.string().max(300).optional(),
    approvedByUser: z.literal(true),
    allowConflicts: z.boolean().default(false),
  })
  .refine((value) => Date.parse(value.endAt) > Date.parse(value.startAt), {
    message: "endAt must be after startAt",
    path: ["endAt"],
  });

export async function POST(request: Request): Promise<Response> {
  const correlationId = `calendar_${crypto.randomUUID()}`;
  try {
    const input = await parseJson(request, inputSchema);
    const context = await getRepositoryContext();
    const calendar = await createCalendarClient(context.providerAccessToken);
    if (calendar.demo) {
      throw new ApiError(503, "CALENDAR_NOT_CONNECTED", "Google Calendar is not connected");
    }
    const conflicts = await calendar.checkConflicts(input.startAt, input.endAt);
    await log.info("calendar_conflict_check", "Calendar conflicts checked", {
      correlationId,
      userId: context.userId,
      context: { conflict_count: conflicts.length, approved_by_user: true },
    });
    if (conflicts.length > 0 && !input.allowConflicts) {
      throw new ApiError(409, "CALENDAR_CONFLICT", "The selected time conflicts with an existing event", {
        conflictCount: conflicts.length,
      });
    }
    const created = await calendar.createEvent({
      title: input.title,
      startAt: input.startAt,
      endAt: input.endAt,
      timezone: input.timezone,
      location: input.location,
      confidence: 1,
    });
    const sourceMessage = input.messageId ? await context.repository.getMessage(input.messageId) : null;
    const stored = await context.repository.saveCalendarEvent({
      providerEventId: created.providerEventId,
      sourceMessageId: sourceMessage?.id,
      title: created.title,
      description: created.description,
      startAt: created.startAt,
      endAt: created.endAt,
      timezone: created.timezone,
      status: created.status,
      location: created.location,
      htmlLink: created.htmlLink,
      conflictWarning: conflicts.length > 0,
    });
    await log.info("calendar_event_create", "User-approved calendar event created", {
      correlationId,
      userId: context.userId,
      context: {
        calendar: {
          event_id: stored.id,
          provider_event_id: stored.providerEventId,
          conflict_warning: stored.conflictWarning,
          approved_by_user: true,
        },
      },
    });
    return Response.json({ event: stored, conflicts, demo: context.demo || calendar.demo });
  } catch (error) {
    return errorResponse(error, { operation: "calendar_event_create", correlationId, service: "google_calendar" });
  }
}
