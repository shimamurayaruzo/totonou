import "server-only";

export type MailChannelName = "gmail" | "xserver";
export type MailAccount = "gmail" | "goodsystem";
export type TriageCategory =
  | "reply_required"
  | "action_required"
  | "information"
  | "ignore";
export type TaskPriority = "urgent" | "today" | "anytime";
export type TaskType = "sukima" | "jikkuri";
export type TaskStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "carried_over"
  | "cancelled";

export type MailAddress = {
  name?: string;
  address: string;
};

export type MailMessageSummary = {
  externalId: string;
  threadId?: string;
  channel: MailChannelName;
  account: MailAccount;
  from: MailAddress;
  to: MailAddress[];
  subject: string;
  snippet: string;
  receivedAt: string;
  labels: string[];
  isRead: boolean;
};

export type MailMessage = MailMessageSummary & {
  bodyText: string;
  bodyHtml?: string;
  providerUrl?: string;
  internetMessageId?: string;
};

export type FetchMessagesOptions = {
  limit?: number;
  since?: Date;
  unreadOnly?: boolean;
};

export type SendReplyInput = {
  messageId: string;
  threadId?: string;
  to: MailAddress;
  subject: string;
  bodyText: string;
  inReplyTo?: string;
};

export type SendReplyResult = {
  externalId: string;
  threadId?: string;
};

export type TriageResult = {
  category: TriageCategory;
  priority: TaskPriority;
  taskType: TaskType;
  reason: string;
  taskTitle: string;
};

export type StoredMessage = {
  id: string;
  userId?: string;
  externalId: string;
  threadId?: string;
  channel: MailChannelName;
  account: MailAccount;
  senderName?: string;
  senderAddress: string;
  recipientAddresses: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  snippet: string;
  receivedAt: string;
  category?: string;
  triageResult?: TriageResult;
  isRead: boolean;
  providerUrl?: string;
};

export type TaskRecord = {
  id: string;
  userId?: string;
  source: "email" | "manual" | "calendar";
  messageId?: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  taskType: TaskType;
  status: TaskStatus;
  estimatedMinutes?: number;
  startedAt?: string;
  completedAt?: string;
  dueDate?: string;
  carriedOverFrom?: string;
  elapsedMinutes?: number;
};

export type CalendarEventRecord = {
  id: string;
  providerEventId?: string;
  sourceMessageId?: string;
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
  timezone: string;
  status: string;
  location?: string;
  htmlLink?: string;
  conflictWarning: boolean;
};

export type ScheduleCandidate = {
  title: string;
  startAt: string;
  endAt: string;
  timezone: string;
  location?: string;
  confidence: number;
};

export type DailyReviewRecord = {
  id: string;
  date: string;
  goal: string;
  result: string;
  goodJob: string;
  badJob: string;
  rules: string;
  improvements: string;
  cheer: string;
  exportedHtml?: string;
};

export type ReplyDraftRecord = {
  id: string;
  messageId: string;
  subject: string;
  bodyText: string;
  status: "draft" | "approved" | "sent";
  providerMessageId?: string;
  createdAt: string;
};

export type MailStyleProfile = {
  greeting: string;
  closing: string;
  formality: "casual" | "balanced" | "formal";
  averageLength: number;
  usesEmoji: boolean;
  notes: string[];
};

export type ActivityRecord = {
  id: string | number;
  ts: string;
  level: "INFO" | "WARN" | "ERROR";
  operation: string;
  message: string;
  correlationId?: string;
  context?: Record<string, unknown>;
  humanNote?: string;
  aiTodo?: string;
};

export type UserSettings = {
  dreams: string;
  monthlyGoals: string;
  fetchRange: "latest_100" | "last_5_days";
  coachPersona: "gentle_secretary" | "passionate_coach" | "butler";
  markAsRead: boolean;
};

export type BriefingData = {
  date: string;
  summary: string;
  cheer: string;
  goal: string;
  tasks: TaskRecord[];
  events: CalendarEventRecord[];
  settings: UserSettings;
  demo: boolean;
};
