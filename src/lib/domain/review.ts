import type {
  ActivityLog,
  CalendarEvent,
  DailyReview,
  ISODate,
  ISODateTime,
  PlannedActualEntry,
  PraiseEvidence,
  PraisePost,
  Task,
  UserId,
  WeeklyReview,
} from "../types";

export type ReviewDomainErrorCode =
  | "INVALID_DATE"
  | "INVALID_TIMESTAMP"
  | "INVALID_DATE_RANGE"
  | "USER_MISMATCH";

export class ReviewDomainError extends Error {
  readonly code: ReviewDomainErrorCode;

  constructor(code: ReviewDomainErrorCode, message: string) {
    super(message);
    this.name = "ReviewDomainError";
    this.code = code;
  }
}

function assertDate(value: ISODate, field: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ReviewDomainError("INVALID_DATE", `${field} must use YYYY-MM-DD`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ReviewDomainError("INVALID_DATE", `${field} is not a real date`);
  }
}

function timestamp(value: ISODateTime, field: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new ReviewDomainError(
      "INVALID_TIMESTAMP",
      `${field} must be a valid timestamp`,
    );
  }
  return parsed;
}

function dateAt(timestampValue: ISODateTime, timeZone: string): ISODate {
  const value = new Date(timestampValue);
  if (Number.isNaN(value.getTime())) {
    throw new ReviewDomainError(
      "INVALID_TIMESTAMP",
      "record contains an invalid timestamp",
    );
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function positiveMinutes(value: number | null): number {
  return value !== null && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function eventMinutes(event: CalendarEvent): number {
  const start = timestamp(event.startAt, "event.startAt");
  const end = timestamp(event.endAt, "event.endAt");
  if (end < start) {
    throw new ReviewDomainError(
      "INVALID_DATE_RANGE",
      `event ${event.id} ends before it starts`,
    );
  }
  return Math.ceil((end - start) / 60_000);
}

function eventTouchesDate(
  event: CalendarEvent,
  date: ISODate,
  timeZone: string,
): boolean {
  return dateAt(event.startAt, timeZone) <= date && dateAt(event.endAt, timeZone) >= date;
}

function taskBelongsToDate(task: Task, date: ISODate, timeZone: string): boolean {
  return (
    task.dueDate === date ||
    (task.completedAt !== null && dateAt(task.completedAt, timeZone) === date)
  );
}

export function comparePlannedAndActual(
  events: readonly CalendarEvent[],
  tasks: readonly Task[],
  date: ISODate,
  userId: UserId,
  timeZone = "Asia/Tokyo",
): PlannedActualEntry[] {
  assertDate(date, "date");
  const dayEvents = events.filter(
    (event) =>
      event.userId === userId &&
      event.status !== "cancelled" &&
      eventTouchesDate(event, date, timeZone),
  );
  const dayTasks = tasks.filter(
    (task) =>
      task.userId === userId &&
      task.status !== "cancelled" &&
      task.status !== "carried_over" &&
      taskBelongsToDate(task, date, timeZone),
  );
  const eventIds = new Set(dayEvents.map((event) => event.id));
  const eventEntries = dayEvents.map((event): PlannedActualEntry => {
    const linkedTasks = dayTasks.filter(
      (task) => task.calendarEventId === event.id,
    );
    const completed = linkedTasks.filter((task) => task.status === "completed");
    const actualMinutes = completed.reduce(
      (total, task) => total + positiveMinutes(task.elapsedMinutes),
      0,
    );
    const status =
      linkedTasks.length === 0
        ? "untracked"
        : completed.length === linkedTasks.length
          ? "completed"
          : "pending";
    return {
      id: `event-${event.id}`,
      label: event.title,
      source: "calendar",
      plannedMinutes: eventMinutes(event),
      actualMinutes,
      status,
    };
  });
  const taskEntries = dayTasks
    .filter(
      (task) =>
        task.calendarEventId === null || !eventIds.has(task.calendarEventId),
    )
    .map(
      (task): PlannedActualEntry => ({
        id: `task-${task.id}`,
        label: task.title,
        source: "task",
        plannedMinutes: Math.max(0, task.estimatedMinutes),
        actualMinutes:
          task.status === "completed"
            ? positiveMinutes(task.elapsedMinutes)
            : 0,
        status: task.status === "completed" ? "completed" : "pending",
      }),
    );
  return [...eventEntries, ...taskEntries];
}

export interface DailyReviewDraftInput {
  readonly userId: UserId;
  readonly date: ISODate;
  readonly goal: string;
  readonly tasks: readonly Task[];
  readonly activityLogs: readonly ActivityLog[];
  readonly calendarEvents?: readonly CalendarEvent[];
  readonly generatedAt: ISODateTime;
  readonly id?: string;
  readonly timeZone?: string;
}

function operationCount(
  logs: readonly ActivityLog[],
  operation: ActivityLog["operation"],
): number {
  return logs.filter((log) => log.operation === operation).length;
}

export function generateDailyReviewDraft(
  input: DailyReviewDraftInput,
): DailyReview {
  assertDate(input.date, "date");
  timestamp(input.generatedAt, "generatedAt");
  const timeZone = input.timeZone ?? "Asia/Tokyo";
  const dayTasks = input.tasks.filter(
    (task) =>
      task.userId === input.userId &&
      task.status !== "cancelled" &&
      taskBelongsToDate(task, input.date, timeZone),
  );
  const dayLogs = input.activityLogs.filter(
    (log) =>
      log.userId === input.userId && dateAt(log.ts, timeZone) === input.date,
  );
  const completedTasks = dayTasks.filter(
    (task) =>
      task.status === "completed" &&
      task.completedAt !== null &&
      dateAt(task.completedAt, timeZone) === input.date,
  );
  const incompleteTasks = dayTasks.filter(
    (task) => task.status === "pending" || task.status === "in_progress",
  );
  const totalMinutes = completedTasks.reduce(
    (total, task) => total + positiveMinutes(task.elapsedMinutes),
    0,
  );
  const plannedMinutes = completedTasks.reduce(
    (total, task) => total + Math.max(0, task.estimatedMinutes),
    0,
  );
  const activityFacts: string[] = [];
  const mailChecks = operationCount(dayLogs, "fetch_mail_batch_complete");
  const replies = operationCount(dayLogs, "reply_send");
  if (mailChecks > 0) {
    activityFacts.push(`メール確認を${mailChecks}回実行`);
  }
  if (replies > 0) {
    activityFacts.push(`承認した返信を${replies}件送信`);
  }
  const resultBase = `${completedTasks.length}件を完了し、合計${totalMinutes}分取り組みました。`;
  const result =
    activityFacts.length > 0
      ? `${resultBase} ${activityFacts.join("、")}しました。`
      : resultBase;
  const goodJob =
    completedTasks.length > 0
      ? `${completedTasks.map((task) => task.title).join("、")}を完了できました。`
      : "実績を確認し、今日の状態を言葉にできました。";
  const badJob =
    incompleteTasks.length > 0
      ? `${incompleteTasks.map((task) => task.title).join("、")}が未完了です。明日へ回すか確認します。`
      : "未完了のタスクはありません。";
  const overrun = plannedMinutes > 0 && totalMinutes > plannedMinutes * 1.2;
  const rules = overrun
    ? "見積もりを超えそうな作業は、着手前に完了条件を一文で決める。"
    : "短い返信はまとめて処理し、集中作業の時間を守る。";
  const urgentRemaining = incompleteTasks.filter(
    (task) => task.priority === "urgent",
  ).length;
  const improvements =
    urgentRemaining > 0
      ? `未完了の今すぐタスク${urgentRemaining}件は、明日の最初の時間に固定する。`
      : overrun
        ? "実績が見積もりを上回った作業を分割し、次回の見積もりに反映する。"
        : "今日うまく進んだ順番を明日も再現する。";
  const cheer =
    completedTasks.length > 0
      ? `${completedTasks.length}件の完了は、今日を自分で前に進めた証拠です。明日も一つずつ整えよう。`
      : "立ち止まって振り返れたことも前進です。明日は一つ目から整えよう。";
  const comparison = comparePlannedAndActual(
    input.calendarEvents ?? [],
    dayTasks,
    input.date,
    input.userId,
    timeZone,
  );
  return {
    id: input.id ?? `daily-review-${input.userId}-${input.date}`,
    userId: input.userId,
    date: input.date,
    status: "draft",
    goal: input.goal.trim() || "今日の優先事項を一つずつ完了する",
    result,
    goodJob,
    badJob,
    rules,
    improvements,
    cheer,
    scheduleComparison: comparison,
    sourceTaskIds: dayTasks.map((task) => task.id),
    sourceLogIds: dayLogs.map((log) => log.id),
    exportedHtml: null,
    generatedAt: input.generatedAt,
    updatedAt: input.generatedAt,
  };
}

export interface WeeklyReviewInput {
  readonly userId: UserId;
  readonly weekStart: ISODate;
  readonly weekEnd: ISODate;
  readonly tasks: readonly Task[];
  readonly dailyReviews: readonly DailyReview[];
  readonly generatedAt: ISODateTime;
  readonly id?: string;
}

function inDateRange(date: ISODate, start: ISODate, end: ISODate): boolean {
  return date >= start && date <= end;
}

function uniqueNonEmpty(values: readonly string[], limit: number): string[] {
  const selected: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed && !seen.has(trimmed)) {
      selected.push(trimmed);
      seen.add(trimmed);
    }
    if (selected.length === limit) {
      break;
    }
  }
  return selected;
}

export function aggregateWeeklyReview(input: WeeklyReviewInput): WeeklyReview {
  assertDate(input.weekStart, "weekStart");
  assertDate(input.weekEnd, "weekEnd");
  timestamp(input.generatedAt, "generatedAt");
  if (input.weekEnd < input.weekStart) {
    throw new ReviewDomainError(
      "INVALID_DATE_RANGE",
      "weekEnd must not be before weekStart",
    );
  }
  const weekTasks = input.tasks.filter(
    (task) =>
      task.userId === input.userId &&
      task.status !== "cancelled" &&
      inDateRange(task.dueDate, input.weekStart, input.weekEnd),
  );
  const reviews = input.dailyReviews
    .filter(
      (review) =>
        review.userId === input.userId &&
        inDateRange(review.date, input.weekStart, input.weekEnd),
    )
    .sort((left, right) => left.date.localeCompare(right.date));
  const completedTasks = weekTasks.filter(
    (task) => task.status === "completed",
  );
  const plannedMinutes = weekTasks.reduce(
    (total, task) => total + Math.max(0, task.estimatedMinutes),
    0,
  );
  const actualMinutes = completedTasks.reduce(
    (total, task) => total + positiveMinutes(task.elapsedMinutes),
    0,
  );
  const totalTaskCount = weekTasks.length;
  const completedTaskCount = completedTasks.length;
  const completionRate =
    totalTaskCount === 0 ? 0 : completedTaskCount / totalTaskCount;
  const highlights = uniqueNonEmpty(
    reviews.map((review) => review.goodJob),
    3,
  );
  const challenges = uniqueNonEmpty(
    reviews
      .map((review) => review.badJob)
      .filter((value) => value !== "未完了のタスクはありません。"),
    3,
  );
  const latestImprovement = [...reviews]
    .reverse()
    .find((review) => review.improvements.trim())?.improvements;
  return {
    id:
      input.id ??
      `weekly-review-${input.userId}-${input.weekStart}-${input.weekEnd}`,
    userId: input.userId,
    weekStart: input.weekStart,
    weekEnd: input.weekEnd,
    status: "draft",
    summary: `${completedTaskCount}/${totalTaskCount}件を完了し、合計${actualMinutes}分取り組みました。`,
    completedTaskCount,
    totalTaskCount,
    plannedMinutes,
    actualMinutes,
    completionRate,
    highlights,
    challenges,
    nextWeekFocus:
      latestImprovement ?? "最初の重要タスクを午前中に完了する",
    sourceDailyReviewIds: reviews.map((review) => review.id),
    generatedAt: input.generatedAt,
    updatedAt: input.generatedAt,
  };
}

export interface GroundedPraiseDraft {
  readonly text: string;
  readonly evidence: readonly PraiseEvidence[];
}

export function generateGroundedPraise(
  userId: UserId,
  weekStart: ISODate,
  weekEnd: ISODate,
  dailyReviews: readonly DailyReview[],
  tasks: readonly Task[],
): GroundedPraiseDraft {
  assertDate(weekStart, "weekStart");
  assertDate(weekEnd, "weekEnd");
  if (weekEnd < weekStart) {
    throw new ReviewDomainError(
      "INVALID_DATE_RANGE",
      "weekEnd must not be before weekStart",
    );
  }
  const reviews = dailyReviews
    .filter(
      (review) =>
        review.userId === userId && inDateRange(review.date, weekStart, weekEnd),
    )
    .sort((left, right) => left.date.localeCompare(right.date));
  const completedTasks = tasks.filter(
    (task) =>
      task.userId === userId &&
      task.status === "completed" &&
      inDateRange(task.dueDate, weekStart, weekEnd),
  );
  const quotes: Array<{
    review: DailyReview;
    kind: PraiseEvidence["kind"];
    quote: string;
  }> = [];
  const firstGoal = reviews.find((review) => review.goal.trim());
  if (firstGoal) {
    quotes.push({ review: firstGoal, kind: "goal", quote: firstGoal.goal.trim() });
  }
  const latestCheer = [...reviews]
    .reverse()
    .find((review) => review.cheer.trim());
  if (latestCheer && latestCheer.id !== firstGoal?.id) {
    quotes.push({
      review: latestCheer,
      kind: "cheer",
      quote: latestCheer.cheer.trim(),
    });
  }
  const fact =
    completedTasks.length > 0
      ? `${completedTasks.length}件のタスクを完了し、合計${completedTasks.reduce(
          (total, task) => total + positiveMinutes(task.elapsedMinutes),
          0,
        )}分取り組んだ`
      : "完了件数がまだ記録されていない中でも振り返りを続けた";
  const evidence = quotes.map(
    ({ review, kind, quote }): PraiseEvidence => ({
      sourceDailyReviewId: review.id,
      sourceDate: review.date,
      kind,
      quote,
      fact,
      taskIds: completedTasks.map((task) => task.id),
    }),
  );
  if (evidence.length === 0) {
    return {
      text: `今週は${fact}一週間でした。過去の自分の言葉はまだ日報に残っていないので、次の一週間に向けた一言を記録しておこう。`,
      evidence: [],
    };
  }
  const quotedWords = evidence
    .map((item) => `「${item.quote}」`)
    .join("、そして");
  return {
    text: `過去のあなたは${quotedWords}と書いていました。実際に今週は${fact}という記録が残っています。自分との約束を行動に変えた一週間、本当によく整えました。`,
    evidence,
  };
}

export interface PraisePostDraftInput {
  readonly id: string;
  readonly weeklyReview: WeeklyReview;
  readonly dailyReviews: readonly DailyReview[];
  readonly tasks: readonly Task[];
  readonly createdAt: ISODateTime;
}

export function createPraisePostDraft(
  input: PraisePostDraftInput,
): PraisePost {
  timestamp(input.createdAt, "createdAt");
  const userId = input.weeklyReview.userId;
  if (
    input.dailyReviews.some((review) => review.userId !== userId) ||
    input.tasks.some((task) => task.userId !== userId)
  ) {
    throw new ReviewDomainError(
      "USER_MISMATCH",
      "praise source records must belong to one user",
    );
  }
  const praise = generateGroundedPraise(
    userId,
    input.weeklyReview.weekStart,
    input.weeklyReview.weekEnd,
    input.dailyReviews,
    input.tasks,
  );
  return {
    id: input.id,
    userId,
    weeklyReviewId: input.weeklyReview.id,
    status: "draft",
    text: praise.text,
    evidence: praise.evidence,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    publishedAt: null,
  };
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function htmlText(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

function safeNumber(value: number): string {
  return String(Number.isFinite(value) ? Math.max(0, value) : 0);
}

export function exportDailyReviewHtml(review: DailyReview): string {
  const rows = review.scheduleComparison
    .map(
      (item) =>
        `<tr><td>${htmlText(item.label)}</td><td>${safeNumber(item.plannedMinutes)}分</td><td>${safeNumber(item.actualMinutes)}分</td><td>${escapeHtml(item.status)}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Totonou 日報 ${escapeHtml(review.date)}</title></head><body><main><h1>Totonou 日報</h1><p><time>${escapeHtml(review.date)}</time></p><section><h2>今日の予定 vs 実際の結果</h2><table><thead><tr><th>項目</th><th>予定</th><th>実績</th><th>状態</th></tr></thead><tbody>${rows}</tbody></table></section><section><h2>今日の目標</h2><p>${htmlText(review.goal)}</p><h2>今日の結果</h2><p>${htmlText(review.result)}</p><h2>グッジョブ・感謝</h2><p>${htmlText(review.goodJob)}</p><h2>バッジョブ・反省</h2><p>${htmlText(review.badJob)}</p><h2>ルール化すること</h2><p>${htmlText(review.rules)}</p><h2>改善策</h2><p>${htmlText(review.improvements)}</p><h2>励まし・自分へのエール</h2><p>${htmlText(review.cheer)}</p></section></main></body></html>`;
}

export const draftDailyReview = generateDailyReviewDraft;
export const generateWeeklyReview = aggregateWeeklyReview;
export const createPraiseFromPastWords = generateGroundedPraise;
export const exportReviewHtml = exportDailyReviewHtml;
