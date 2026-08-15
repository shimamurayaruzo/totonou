import { z } from "zod";

import { log } from "@/lib/logger";
import { anthropic } from "@/lib/server/anthropic";
import { createCalendarClient } from "@/lib/server/calendar";
import { ApiError, errorResponse } from "@/lib/server/http";
import { getRepositoryContext } from "@/lib/server/repository";

export const dynamic = "force-dynamic";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function todayInTokyo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function GET(request: Request): Promise<Response> {
  const correlationId = `brief_${crypto.randomUUID()}`;
  try {
    const requestedDate = new URL(request.url).searchParams.get("date") ?? todayInTokyo();
    const parsedDate = dateSchema.safeParse(requestedDate);
    if (!parsedDate.success) {
      throw new ApiError(422, "INVALID_DATE", "date must use YYYY-MM-DD");
    }
    const date = parsedDate.data;
    const startAt = new Date(`${date}T00:00:00+09:00`).toISOString();
    const endAt = new Date(`${date}T23:59:59.999+09:00`).toISOString();
    const context = await getRepositoryContext();
    const calendar = await createCalendarClient(context.providerAccessToken);
    const [settings, tasks, events] = await Promise.all([
      context.repository.getSettings(),
      context.repository.listTasks(date),
      calendar.listEvents(startAt, endAt),
    ]);
    const openAfternoon = !events.some(
      (event) => Date.parse(event.endAt) > Date.parse(`${date}T12:00:00+09:00`),
    );
    const replyCount = tasks.filter((task) => task.source === "email").length;
    const generated = await anthropic.createThreeSecondSummary({
      eventCount: events.length,
      replyCount,
      taskCount: tasks.length,
      openAfternoon,
      dreams: settings.dreams,
      monthlyGoals: settings.monthlyGoals,
    });
    await log.info("briefing_generate", "Morning briefing generated", {
      correlationId,
      userId: context.userId,
      context: {
        date,
        event_count: events.length,
        reply_count: replyCount,
        task_count: tasks.length,
        model: generated.model,
        demo: context.demo || calendar.demo || generated.demo,
      },
    });
    return Response.json({
      date,
      summary: generated.data.summary,
      cheer: generated.data.cheer,
      goal: settings.monthlyGoals,
      tasks,
      events,
      settings,
      demo: context.demo || calendar.demo || generated.demo,
    });
  } catch (error) {
    return errorResponse(error, { operation: "briefing_generate", correlationId });
  }
}
