export const MAIL_CHANNELS = ["gmail"] as const;
export type MailChannel = (typeof MAIL_CHANNELS)[number];

export const MAIL_ACCOUNTS = ["gmail", "goodsystem"] as const;
export type MailAccount = (typeof MAIL_ACCOUNTS)[number];

export const GMAIL_CATEGORIES = [
  "forums",
  "promotions",
  "social",
  "personal",
  "updates",
  "primary",
  "unknown",
] as const;
export type GmailCategory = (typeof GMAIL_CATEGORIES)[number];

export const TRIAGE_CATEGORIES = [
  "needs_reply",
  "needs_action",
  "information",
  "ignore",
] as const;
export type TriageCategory = (typeof TRIAGE_CATEGORIES)[number];

export const TRIAGE_REASON_CODES = [
  "direct_question",
  "explicit_request",
  "deadline_detected",
  "schedule_coordination",
  "document_review",
  "informational_only",
  "automated_message",
  "marketing_message",
  "other",
] as const;
export type TriageReasonCode = (typeof TRIAGE_REASON_CODES)[number];

export const TASK_PRIORITIES = ["urgent", "today", "anytime"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type Priority = TaskPriority;

export const TASK_TYPES = ["sukima", "jikkuri"] as const;
export type TaskType = (typeof TASK_TYPES)[number];
export type TaskNature = TaskType;

export const TASK_STATUSES = [
  "pending",
  "in_progress",
  "completed",
  "carried_over",
  "cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_SOURCES = ["email", "manual", "calendar"] as const;
export type TaskSource = (typeof TASK_SOURCES)[number];

export const EMAIL_ACTIONS = ["reply", "action"] as const;
export type EmailAction = (typeof EMAIL_ACTIONS)[number];

export const ACTIVITY_LOG_LEVELS = ["INFO", "WARN", "ERROR"] as const;
export type ActivityLogLevel = (typeof ACTIVITY_LOG_LEVELS)[number];

export const ACTIVITY_OPERATIONS = [
  "fetch_mail_batch_start",
  "fetch_mail_batch_complete",
  "triage_exclude_rule",
  "triage_classify",
  "task_create",
  "task_start",
  "task_complete",
  "task_carry_over",
  "reply_draft_generate",
  "reply_send",
  "mark_as_read",
  "review_generate",
  "weekly_review_generate",
  "praise_draft_generate",
  "coach_notify",
  "api_error",
] as const;
export type ActivityOperation = (typeof ACTIVITY_OPERATIONS)[number];

export const FETCH_RANGES = ["latest_100", "last_5_days"] as const;
export type FetchRange = (typeof FETCH_RANGES)[number];

export const COACH_PERSONAS = [
  "gentle_secretary",
  "passionate_coach",
  "butler",
] as const;
export type CoachPersona = (typeof COACH_PERSONAS)[number];

export const REVIEW_STATUSES = ["draft", "completed"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const PRAISE_POST_STATUSES = ["draft", "private", "published"] as const;
export type PraisePostStatus = (typeof PRAISE_POST_STATUSES)[number];

export type ISODate = string;
export type ISODateTime = string;
export type UserId = string;
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
export type JsonObject = { readonly [key: string]: JsonValue };

export interface PersistedEntity {
  readonly userId: UserId;
}

export interface Mailbox {
  readonly name: string;
  readonly address: string;
}

export interface TriageResult {
  readonly category: TriageCategory;
  readonly priority: TaskPriority | null;
  readonly taskType: TaskType | null;
  readonly summary: string;
  readonly reason: string;
  readonly reasonCode: TriageReasonCode;
  readonly confidence: number;
  readonly classifiedAt: ISODateTime;
}

export interface Message extends PersistedEntity {
  readonly messageId: string;
  readonly threadId: string;
  readonly channel: MailChannel;
  readonly account: MailAccount;
  readonly from: Mailbox;
  readonly to: readonly Mailbox[];
  readonly subject: string;
  readonly bodyText: string;
  readonly bodyHtml: string | null;
  readonly receivedAt: ISODateTime;
  readonly category: GmailCategory;
  readonly labels: readonly string[];
  readonly isUnread: boolean;
  readonly sourceUrl: string;
  readonly triageResult: TriageResult | null;
}

export interface Task extends PersistedEntity {
  readonly id: string;
  readonly source: TaskSource;
  readonly messageId: string | null;
  readonly calendarEventId: string | null;
  readonly emailAction: EmailAction | null;
  readonly title: string;
  readonly notes: string;
  readonly priority: TaskPriority;
  readonly taskType: TaskType;
  readonly status: TaskStatus;
  readonly estimatedMinutes: number;
  readonly elapsedMinutes: number | null;
  readonly startedAt: ISODateTime | null;
  readonly completedAt: ISODateTime | null;
  readonly dueDate: ISODate;
  readonly carriedOverFrom: string | null;
  readonly createdAt: ISODateTime;
  readonly updatedAt: ISODateTime;
}

export interface CalendarEvent extends PersistedEntity {
  readonly id: string;
  readonly externalId: string;
  readonly account: MailAccount;
  readonly title: string;
  readonly description: string;
  readonly location: string;
  readonly startAt: ISODateTime;
  readonly endAt: ISODateTime;
  readonly allDay: boolean;
  readonly status: "confirmed" | "tentative" | "cancelled";
  readonly sourceUrl: string;
  readonly createdAt: ISODateTime;
  readonly updatedAt: ISODateTime;
}

export interface PlannedActualEntry {
  readonly id: string;
  readonly label: string;
  readonly source: "calendar" | "task";
  readonly plannedMinutes: number;
  readonly actualMinutes: number;
  readonly status: "completed" | "pending" | "untracked";
}

export interface DailyReview extends PersistedEntity {
  readonly id: string;
  readonly date: ISODate;
  readonly status: ReviewStatus;
  readonly goal: string;
  readonly result: string;
  readonly goodJob: string;
  readonly badJob: string;
  readonly rules: string;
  readonly improvements: string;
  readonly cheer: string;
  readonly scheduleComparison: readonly PlannedActualEntry[];
  readonly sourceTaskIds: readonly string[];
  readonly sourceLogIds: readonly string[];
  readonly exportedHtml: string | null;
  readonly generatedAt: ISODateTime;
  readonly updatedAt: ISODateTime;
}

export interface ActivityLog extends PersistedEntity {
  readonly id: string;
  readonly ts: ISODateTime;
  readonly level: ActivityLogLevel;
  readonly operation: ActivityOperation;
  readonly message: string;
  readonly correlationId: string | null;
  readonly context: JsonObject;
  readonly humanNote: string | null;
  readonly aiTodo: string | null;
}

export interface Settings extends PersistedEntity {
  readonly id: string;
  readonly dreams: readonly string[];
  readonly monthlyGoals: readonly string[];
  readonly fetchRange: FetchRange;
  readonly coachPersona: CoachPersona;
  readonly markAsRead: boolean;
  readonly domainAllowlist: readonly string[];
  readonly domainBlocklist: readonly string[];
  readonly timeZone: string;
  readonly weekStartsOn: 0 | 1;
  readonly createdAt: ISODateTime;
  readonly updatedAt: ISODateTime;
}

export interface WeeklyReview extends PersistedEntity {
  readonly id: string;
  readonly weekStart: ISODate;
  readonly weekEnd: ISODate;
  readonly status: ReviewStatus;
  readonly summary: string;
  readonly completedTaskCount: number;
  readonly totalTaskCount: number;
  readonly plannedMinutes: number;
  readonly actualMinutes: number;
  readonly completionRate: number;
  readonly highlights: readonly string[];
  readonly challenges: readonly string[];
  readonly nextWeekFocus: string;
  readonly sourceDailyReviewIds: readonly string[];
  readonly generatedAt: ISODateTime;
  readonly updatedAt: ISODateTime;
}

export interface PraiseEvidence {
  readonly sourceDailyReviewId: string;
  readonly sourceDate: ISODate;
  readonly kind: "goal" | "cheer";
  readonly quote: string;
  readonly fact: string;
  readonly taskIds: readonly string[];
}

export interface PraisePost extends PersistedEntity {
  readonly id: string;
  readonly weeklyReviewId: string;
  readonly status: PraisePostStatus;
  readonly text: string;
  readonly evidence: readonly PraiseEvidence[];
  readonly createdAt: ISODateTime;
  readonly updatedAt: ISODateTime;
  readonly publishedAt: ISODateTime | null;
}

export interface AppState extends PersistedEntity {
  readonly asOfDate: ISODate;
  readonly messages: readonly Message[];
  readonly tasks: readonly Task[];
  readonly calendarEvents: readonly CalendarEvent[];
  readonly dailyReviews: readonly DailyReview[];
  readonly activityLogs: readonly ActivityLog[];
  readonly settings: Settings;
  readonly weeklyReviews: readonly WeeklyReview[];
  readonly praisePosts: readonly PraisePost[];
}
