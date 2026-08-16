import { z } from "zod";

import { log } from "@/lib/logger";
import { anthropic } from "@/lib/server/anthropic";
import { listCalendarEventsWithFallback } from "@/lib/server/calendar";
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
    const [settings, openTasks, completedTasks, messages, calendarResult] = await Promise.all([
      context.repository.getSettings(),
      context.repository.listTasks(date),
      context.repository.listCompletedTasks(date),
      context.repository.listMessages(100),
      listCalendarEventsWithFallback(startAt, endAt, context.providerAccessToken),
    ]);
    const tasks = [
      ...openTasks,
      ...completedTasks.filter(
        (completed) => !openTasks.some((task) => task.id === completed.id),
      ),
    ].filter((task) => {
      if (task.source !== "email") return true;
      const sourceMessage = task.messageId
        ? messages.find((message) => message.id === task.messageId)
        : undefined;
      return sourceMessage?.triageResult?.category === "reply_required";
    });
    const events = calendarResult.events;
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
        demo: context.demo || calendarResult.demo || generated.demo,
      },
    });
    return Response.json({
      date,
      summary: generated.data.summary,
      cheer: generated.data.cheer,
      goal: settings.monthlyGoals,
      userId: context.userId,
      tasks,
      messages,
      events,
      settings,
      demo: context.demo || calendarResult.demo || generated.demo,
    });
  } catch (error) {
    return errorResponse(error, { operation: "briefing_generate", correlationId });
  }
}
