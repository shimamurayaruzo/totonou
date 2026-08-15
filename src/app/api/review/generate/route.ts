import { z } from "zod";

import { log } from "@/lib/logger";
import { anthropic } from "@/lib/server/anthropic";
import { errorResponse, parseOptionalJson } from "@/lib/server/http";
import { getRepositoryContext } from "@/lib/server/repository";

const inputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function todayInTokyo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function POST(request: Request): Promise<Response> {
  const correlationId = `review_${crypto.randomUUID()}`;
  try {
    const input = await parseOptionalJson(request, inputSchema);
    const date = input.date ?? todayInTokyo();
    const context = await getRepositoryContext();
    const [settings, completedTasks, openTasks, activities] = await Promise.all([
      context.repository.getSettings(),
      context.repository.listCompletedTasks(date),
      context.repository.listTasks(date),
      context.repository.listActivities(100),
    ]);
    const totalMinutes = completedTasks.reduce((sum, task) => sum + (task.elapsedMinutes ?? 0), 0);
    const generated = await anthropic.generateDailyReview({
      date,
      goal: settings.monthlyGoals,
      completedTasks,
      totalMinutes,
      activitySummary: activities
        .filter((activity) => activity.ts.startsWith(date))
        .map((activity) => activity.operation),
    });
    const review = await context.repository.saveReview({
      date,
      goal: settings.monthlyGoals,
      ...generated.data,
    });
    await log.info("review_generate", "Daily review draft generated", {
      correlationId,
      userId: context.userId,
      context: {
        review: {
          date,
          tasks_done: completedTasks.length,
          tasks_open: openTasks.length,
          total_min: totalMinutes,
        },
        ai: { model: generated.model },
      },
    });
    return Response.json({ review, demo: context.demo || generated.demo });
  } catch (error) {
    return errorResponse(error, { operation: "review_generate", correlationId });
  }
}

export const GET = POST;
