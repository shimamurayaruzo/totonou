import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ExternalServiceError } from "@/lib/server/http";
import type {
  ActivityRecord,
  CalendarEventRecord,
  DailyReviewRecord,
  MailStyleProfile,
  ReplyDraftRecord,
  StoredMessage,
  TaskRecord,
  TriageResult,
  UserSettings,
} from "@/lib/server/models";
import {
  createSupabaseServerClient,
  getAuthContext,
  getSupabaseAdminClient,
} from "@/lib/server/supabase";

export type MessageInput = Omit<StoredMessage, "id" | "userId">;
export type CalendarEventInput = Omit<CalendarEventRecord, "id">;
export type ReviewInput = Omit<DailyReviewRecord, "id" | "exportedHtml">;

export interface TotonouRepository {
  readonly demo: boolean;
  getSettings(): Promise<UserSettings>;
  listTasks(date: string): Promise<TaskRecord[]>;
  listCompletedTasks(date: string): Promise<TaskRecord[]>;
  listEvents(startAt: string, endAt: string): Promise<CalendarEventRecord[]>;
  listMessages(limit: number): Promise<StoredMessage[]>;
  getMessage(id: string): Promise<StoredMessage | null>;
  saveMessages(messages: MessageInput[]): Promise<StoredMessage[]>;
  createTaskFromMessage(
    messageId: string,
    triage: TriageResult,
    dueDate: string,
  ): Promise<TaskRecord | null>;
  startTask(id: string, at?: string): Promise<TaskRecord | null>;
  completeTask(id: string, at?: string): Promise<TaskRecord | null>;
  saveReplyDraft(
    messageId: string,
    subject: string,
    bodyText: string,
  ): Promise<ReplyDraftRecord>;
  getReplyDraft(id: string): Promise<ReplyDraftRecord | null>;
  markReplySent(id: string, providerMessageId: string): Promise<void>;
  saveReview(input: ReviewInput): Promise<DailyReviewRecord>;
  getReview(date: string): Promise<DailyReviewRecord | null>;
  saveReviewExport(id: string, html: string): Promise<void>;
  listActivities(limit: number, correlationId?: string): Promise<ActivityRecord[]>;
  saveCalendarEvent(input: CalendarEventInput): Promise<CalendarEventRecord>;
  saveStyleProfile(profile: MailStyleProfile, sampleCount: number): Promise<void>;
  getStyleProfile(): Promise<MailStyleProfile | null>;
}

const defaultSettings: UserSettings = {
  dreams: "落ち着いて価値ある仕事を続ける",
  monthlyGoals: "毎日の計画と振り返りを定着させる",
  fetchRange: "last_5_days",
  coachPersona: "gentle_secretary",
  markAsRead: true,
};

function dateAt(date: string, hour: number, minute = 0): string {
  return new Date(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+09:00`).toISOString();
}

const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const demoMessages: StoredMessage[] = [
  {
    id: "demo-message-1",
    externalId: "demo-gmail-1",
    threadId: "demo-thread-1",
    channel: "gmail",
    account: "gmail",
    senderName: "デモ取引先",
    senderAddress: "partner@example.com",
    recipientAddresses: ["demo@example.com"],
    subject: "打ち合わせ日程の確認",
    bodyText:
      "次回の打ち合わせについて、明日の14時から15時でいかがでしょうか。ご確認をお願いします。",
    snippet: "次回の打ち合わせ日程をご確認ください。",
    receivedAt: dateAt(today, 7, 30),
    category: "forums",
    triageResult: {
      category: "reply_required",
      priority: "today",
      taskType: "sukima",
      reason: "日程確認への返信が必要です。",
      taskTitle: "打ち合わせ日程へ返信する",
    },
    isRead: false,
    providerUrl: "https://mail.google.com/mail/u/0/#inbox/demo-gmail-1",
  },
  {
    id: "demo-message-2",
    externalId: "demo-xserver-1",
    channel: "xserver",
    account: "goodsystem",
    senderName: "デモ顧客",
    senderAddress: "customer@example.net",
    recipientAddresses: ["contact@example.jp"],
    subject: "資料更新のお願い",
    bodyText: "共有資料の2ページ目を本日中に更新してください。",
    snippet: "共有資料の更新をお願いします。",
    receivedAt: dateAt(today, 8, 10),
    category: "action_required",
    triageResult: {
      category: "action_required",
      priority: "today",
      taskType: "jikkuri",
      reason: "本日中の資料更新が必要です。",
      taskTitle: "共有資料を更新する",
    },
    isRead: false,
  },
];

const demoTasks: TaskRecord[] = [
  {
    id: "demo-task-1",
    source: "email",
    messageId: "demo-message-1",
    title: "打ち合わせ日程へ返信する",
    priority: "urgent",
    taskType: "sukima",
    status: "pending",
    estimatedMinutes: 10,
    dueDate: today,
  },
  {
    id: "demo-task-2",
    source: "email",
    messageId: "demo-message-2",
    title: "共有資料を更新する",
    priority: "today",
    taskType: "jikkuri",
    status: "pending",
    estimatedMinutes: 45,
    dueDate: today,
  },
  {
    id: "demo-task-3",
    source: "manual",
    title: "日報の改善点を整理する",
    priority: "anytime",
    taskType: "sukima",
    status: "pending",
    estimatedMinutes: 15,
    dueDate: today,
  },
];

const demoDrafts: ReplyDraftRecord[] = [];
const demoReviews: DailyReviewRecord[] = [];
const demoActivities: ActivityRecord[] = [];
const demoEvents: CalendarEventRecord[] = [];
let demoStyleProfile: MailStyleProfile | null = null;

function makeDemoEvents(date: string): CalendarEventRecord[] {
  return [
    {
      id: `demo-event-${date}-1`,
      providerEventId: `demo-provider-${date}-1`,
      title: "朝会",
      startAt: dateAt(date, 9, 30),
      endAt: dateAt(date, 10),
      timezone: "Asia/Tokyo",
      status: "confirmed",
      conflictWarning: false,
    },
    {
      id: `demo-event-${date}-2`,
      providerEventId: `demo-provider-${date}-2`,
      title: "プロジェクト打ち合わせ",
      startAt: dateAt(date, 11),
      endAt: dateAt(date, 12),
      timezone: "Asia/Tokyo",
      status: "confirmed",
      conflictWarning: false,
    },
    {
      id: `demo-event-${date}-3`,
      providerEventId: `demo-provider-${date}-3`,
      title: "レビュー",
      startAt: dateAt(date, 15),
      endAt: dateAt(date, 15, 30),
      timezone: "Asia/Tokyo",
      status: "confirmed",
      conflictWarning: false,
    },
  ];
}

export class DemoTotonouRepository implements TotonouRepository {
  readonly demo = true;

  async getSettings(): Promise<UserSettings> {
    return { ...defaultSettings };
  }

  async listTasks(date: string): Promise<TaskRecord[]> {
    return demoTasks
      .filter(
        (task) =>
          task.status !== "completed" &&
          (!task.dueDate || task.dueDate <= date),
      )
      .map((task) => ({ ...task, dueDate: task.dueDate ?? date }));
  }

  async listCompletedTasks(date: string): Promise<TaskRecord[]> {
    return demoTasks
      .filter(
        (task) => task.status === "completed" && task.completedAt?.startsWith(date),
      )
      .map((task) => ({ ...task }));
  }

  async listEvents(startAt: string, endAt: string): Promise<CalendarEventRecord[]> {
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(startAt));
    const generated = makeDemoEvents(date);
    return [...generated, ...demoEvents]
      .filter((event) => event.startAt < endAt && event.endAt > startAt)
      .map((event) => ({ ...event }));
  }

  async listMessages(limit: number): Promise<StoredMessage[]> {
    return [...demoMessages]
      .sort((left, right) => Date.parse(right.receivedAt) - Date.parse(left.receivedAt))
      .slice(0, limit)
      .map((message) => ({ ...message }));
  }

  async getMessage(id: string): Promise<StoredMessage | null> {
    const message = demoMessages.find(
      (item) => item.id === id || item.externalId === id,
    );
    return message ? { ...message } : null;
  }

  async saveMessages(messages: MessageInput[]): Promise<StoredMessage[]> {
    return messages.map((input) => {
      const existing = demoMessages.find(
        (message) =>
          message.externalId === input.externalId &&
          message.channel === input.channel,
      );
      if (existing) {
        Object.assign(existing, input);
        return { ...existing };
      }
      const created: StoredMessage = {
        ...input,
        id: `demo-message-${demoMessages.length + 1}`,
      };
      demoMessages.push(created);
      return { ...created };
    });
  }

  async createTaskFromMessage(
    messageId: string,
    triage: TriageResult,
    dueDate: string,
  ): Promise<TaskRecord | null> {
    const existing = demoTasks.find(
      (task) => task.source === "email" && task.messageId === messageId,
    );
    if (existing) {
      return { ...existing };
    }
    const created: TaskRecord = {
      id: `demo-task-${demoTasks.length + 1}`,
      source: "email",
      messageId,
      title: triage.taskTitle,
      description: triage.reason,
      priority: triage.priority,
      taskType: triage.taskType,
      status: "pending",
      dueDate,
    };
    demoTasks.push(created);
    return { ...created };
  }

  async startTask(id: string, at = new Date().toISOString()): Promise<TaskRecord | null> {
    const task = demoTasks.find((item) => item.id === id);
    if (!task || task.status === "completed") {
      return null;
    }
    task.status = "in_progress";
    task.startedAt = task.startedAt ?? at;
    return { ...task };
  }

  async completeTask(
    id: string,
    at = new Date().toISOString(),
  ): Promise<TaskRecord | null> {
    const task = demoTasks.find((item) => item.id === id);
    if (!task) {
      return null;
    }
    task.status = "completed";
    task.startedAt = task.startedAt ?? at;
    task.completedAt = at;
    task.elapsedMinutes = Math.max(
      0,
      Math.round(
        (new Date(at).getTime() - new Date(task.startedAt).getTime()) / 60000,
      ),
    );
    return { ...task };
  }

  async saveReplyDraft(
    messageId: string,
    subject: string,
    bodyText: string,
  ): Promise<ReplyDraftRecord> {
    const draft: ReplyDraftRecord = {
      id: `demo-draft-${demoDrafts.length + 1}`,
      messageId,
      subject,
      bodyText,
      status: "draft",
      createdAt: new Date().toISOString(),
    };
    demoDrafts.push(draft);
    return { ...draft };
  }

  async getReplyDraft(id: string): Promise<ReplyDraftRecord | null> {
    const draft = demoDrafts.find((item) => item.id === id);
    return draft ? { ...draft } : null;
  }

  async markReplySent(id: string, providerMessageId: string): Promise<void> {
    const draft = demoDrafts.find((item) => item.id === id);
    if (draft) {
      draft.status = "sent";
      draft.providerMessageId = providerMessageId;
    }
  }

  async saveReview(input: ReviewInput): Promise<DailyReviewRecord> {
    const existing = demoReviews.find((review) => review.date === input.date);
    if (existing) {
      Object.assign(existing, input);
      return { ...existing };
    }
    const review: DailyReviewRecord = {
      ...input,
      id: `demo-review-${demoReviews.length + 1}`,
    };
    demoReviews.push(review);
    return { ...review };
  }

  async getReview(date: string): Promise<DailyReviewRecord | null> {
    const review = demoReviews.find((item) => item.date === date);
    return review ? { ...review } : null;
  }

  async saveReviewExport(id: string, html: string): Promise<void> {
    const review = demoReviews.find((item) => item.id === id);
    if (review) {
      review.exportedHtml = html;
    }
  }

  async listActivities(
    limit: number,
    correlationId?: string,
  ): Promise<ActivityRecord[]> {
    return demoActivities
      .filter(
        (activity) =>
          !correlationId || activity.correlationId === correlationId,
      )
      .slice(-limit)
      .reverse()
      .map((activity) => ({ ...activity }));
  }

  async saveCalendarEvent(
    input: CalendarEventInput,
  ): Promise<CalendarEventRecord> {
    const event: CalendarEventRecord = {
      ...input,
      id: `demo-calendar-event-${demoEvents.length + 1}`,
    };
    demoEvents.push(event);
    return { ...event };
  }

  async saveStyleProfile(
    profile: MailStyleProfile,
  ): Promise<void> {
    demoStyleProfile = { ...profile, notes: [...profile.notes] };
  }

  async getStyleProfile(): Promise<MailStyleProfile | null> {
    return demoStyleProfile
      ? { ...demoStyleProfile, notes: [...demoStyleProfile.notes] }
      : null;
  }
}

function assertResult<T>(data: T | null, error: unknown): T {
  if (error || data === null) {
    throw new ExternalServiceError("supabase");
  }
  return data;
}

type TaskRow = {
  id: string;
  user_id?: string;
  source: TaskRecord["source"];
  message_id?: string | null;
  title: string;
  description?: string | null;
  priority: TaskRecord["priority"];
  task_type: TaskRecord["taskType"];
  status: TaskRecord["status"];
  estimated_minutes?: number | null;
  started_at?: string | null;
  completed_at?: string | null;
  due_date?: string | null;
  carried_over_from?: string | null;
  elapsed_minutes?: number | null;
};

type MessageRow = {
  id: string;
  user_id?: string;
  external_id: string;
  thread_id?: string | null;
  channel: StoredMessage["channel"];
  account: StoredMessage["account"];
  sender_name?: string | null;
  sender_address: string;
  recipient_addresses?: string[] | null;
  subject: string;
  body_text: string;
  body_html?: string | null;
  snippet: string;
  received_at: string;
  category?: string | null;
  triage_result?: TriageResult | null;
  is_read: boolean;
  provider_url?: string | null;
};

type EventRow = {
  id: string;
  provider_event_id?: string | null;
  source_message_id?: string | null;
  title: string;
  description?: string | null;
  start_at: string;
  end_at: string;
  timezone: string;
  status: string;
  location?: string | null;
  html_link?: string | null;
  conflict_warning: boolean;
};

type ReviewRow = {
  id: string;
  review_date: string;
  goal: string;
  result: string;
  good_job: string;
  bad_job: string;
  rules: string;
  improvements: string;
  cheer: string;
  exported_html?: string | null;
};

type DraftRow = {
  id: string;
  message_id: string;
  subject: string;
  body_text: string;
  status: ReplyDraftRecord["status"];
  provider_message_id?: string | null;
  created_at: string;
};

type ActivityRow = {
  id: string | number;
  ts: string;
  level: ActivityRecord["level"];
  operation: string;
  message: string;
  correlation_id?: string | null;
  context?: Record<string, unknown> | null;
  human_note?: string | null;
  ai_todo?: string | null;
};

function mapTask(row: TaskRow): TaskRecord {
  return {
    id: row.id,
    userId: row.user_id,
    source: row.source,
    messageId: row.message_id ?? undefined,
    title: row.title,
    description: row.description ?? undefined,
    priority: row.priority,
    taskType: row.task_type,
    status: row.status,
    estimatedMinutes: row.estimated_minutes ?? undefined,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    dueDate: row.due_date ?? undefined,
    carriedOverFrom: row.carried_over_from ?? undefined,
    elapsedMinutes: row.elapsed_minutes ?? undefined,
  };
}

function mapMessage(row: MessageRow): StoredMessage {
  return {
    id: row.id,
    userId: row.user_id,
    externalId: row.external_id,
    threadId: row.thread_id ?? undefined,
    channel: row.channel,
    account: row.account,
    senderName: row.sender_name ?? undefined,
    senderAddress: row.sender_address,
    recipientAddresses: row.recipient_addresses ?? [],
    subject: row.subject,
    bodyText: row.body_text,
    bodyHtml: row.body_html ?? undefined,
    snippet: row.snippet,
    receivedAt: row.received_at,
    category: row.category ?? undefined,
    triageResult: row.triage_result ?? undefined,
    isRead: row.is_read,
    providerUrl: row.provider_url ?? undefined,
  };
}

function mapEvent(row: EventRow): CalendarEventRecord {
  return {
    id: row.id,
    providerEventId: row.provider_event_id ?? undefined,
    sourceMessageId: row.source_message_id ?? undefined,
    title: row.title,
    description: row.description ?? undefined,
    startAt: row.start_at,
    endAt: row.end_at,
    timezone: row.timezone,
    status: row.status,
    location: row.location ?? undefined,
    htmlLink: row.html_link ?? undefined,
    conflictWarning: row.conflict_warning,
  };
}

function mapReview(row: ReviewRow): DailyReviewRecord {
  return {
    id: row.id,
    date: row.review_date,
    goal: row.goal,
    result: row.result,
    goodJob: row.good_job,
    badJob: row.bad_job,
    rules: row.rules,
    improvements: row.improvements,
    cheer: row.cheer,
    exportedHtml: row.exported_html ?? undefined,
  };
}

function mapDraft(row: DraftRow): ReplyDraftRecord {
  return {
    id: row.id,
    messageId: row.message_id,
    subject: row.subject,
    bodyText: row.body_text,
    status: row.status,
    providerMessageId: row.provider_message_id ?? undefined,
    createdAt: row.created_at,
  };
}

export class SupabaseTotonouRepository implements TotonouRepository {
  readonly demo = false;

  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string,
  ) {}

  async getSettings(): Promise<UserSettings> {
    const { data, error } = await this.client
      .from("settings")
      .select("*")
      .eq("user_id", this.userId)
      .maybeSingle();
    if (error) {
      throw new ExternalServiceError("supabase");
    }
    if (!data) {
      return { ...defaultSettings };
    }
    return {
      dreams: data.dreams ?? "",
      monthlyGoals: data.monthly_goals ?? "",
      fetchRange: data.fetch_range,
      coachPersona: data.coach_persona,
      markAsRead: data.mark_as_read,
    };
  }

  async listTasks(date: string): Promise<TaskRecord[]> {
    const { data, error } = await this.client
      .from("tasks")
      .select("*")
      .eq("user_id", this.userId)
      .neq("status", "completed")
      .or(`due_date.is.null,due_date.lte.${date}`)
      .order("priority")
      .order("created_at");
    return assertResult(data, error).map(mapTask);
  }

  async listCompletedTasks(date: string): Promise<TaskRecord[]> {
    const startAt = new Date(`${date}T00:00:00+09:00`).toISOString();
    const endAt = new Date(`${date}T23:59:59.999+09:00`).toISOString();
    const { data, error } = await this.client
      .from("tasks")
      .select("*")
      .eq("user_id", this.userId)
      .eq("status", "completed")
      .gte("completed_at", startAt)
      .lte("completed_at", endAt)
      .order("completed_at");
    return assertResult(data, error).map(mapTask);
  }

  async listEvents(startAt: string, endAt: string): Promise<CalendarEventRecord[]> {
    const { data, error } = await this.client
      .from("calendar_events")
      .select("*")
      .eq("user_id", this.userId)
      .lt("start_at", endAt)
      .gt("end_at", startAt)
      .order("start_at");
    return assertResult(data, error).map(mapEvent);
  }

  async listMessages(limit: number): Promise<StoredMessage[]> {
    const { data, error } = await this.client
      .from("messages")
      .select("*")
      .eq("user_id", this.userId)
      .order("received_at", { ascending: false })
      .limit(Math.min(100, Math.max(1, limit)));
    return assertResult(data, error).map(mapMessage);
  }

  async getMessage(id: string): Promise<StoredMessage | null> {
    const { data, error } = await this.client
      .from("messages")
      .select("*")
      .eq("user_id", this.userId)
      .or(`id.eq.${id},external_id.eq.${id}`)
      .maybeSingle();
    if (error) {
      throw new ExternalServiceError("supabase");
    }
    return data ? mapMessage(data) : null;
  }

  async saveMessages(messages: MessageInput[]): Promise<StoredMessage[]> {
    if (messages.length === 0) {
      return [];
    }
    const rows = messages.map((message) => ({
      user_id: this.userId,
      external_id: message.externalId,
      thread_id: message.threadId ?? null,
      channel: message.channel,
      account: message.account,
      sender_name: message.senderName ?? null,
      sender_address: message.senderAddress,
      recipient_addresses: message.recipientAddresses,
      subject: message.subject,
      body_text: message.bodyText,
      body_html: message.bodyHtml ?? null,
      snippet: message.snippet,
      received_at: message.receivedAt,
      category: message.category ?? null,
      triage_result: message.triageResult ?? {},
      is_read: message.isRead,
      provider_url: message.providerUrl ?? null,
    }));
    const { data, error } = await this.client
      .from("messages")
      .upsert(rows, { onConflict: "user_id,channel,external_id" })
      .select("*");
    return assertResult(data, error).map(mapMessage);
  }

  async createTaskFromMessage(
    messageId: string,
    triage: TriageResult,
    dueDate: string,
  ): Promise<TaskRecord | null> {
    const { data: existing, error: existingError } = await this.client
      .from("tasks")
      .select("*")
      .eq("user_id", this.userId)
      .eq("source", "email")
      .eq("message_id", messageId)
      .maybeSingle();
    if (existingError) {
      throw new ExternalServiceError("supabase");
    }
    if (existing) {
      return mapTask(existing);
    }
    const { data, error } = await this.client
      .from("tasks")
      .insert({
        user_id: this.userId,
        source: "email",
        message_id: messageId,
        title: triage.taskTitle,
        description: triage.reason,
        priority: triage.priority,
        task_type: triage.taskType,
        status: "pending",
        due_date: dueDate,
      })
      .select("*")
      .single();
    return mapTask(assertResult(data, error));
  }

  async startTask(id: string, at = new Date().toISOString()): Promise<TaskRecord | null> {
    const { data: task, error: taskError } = await this.client
      .from("tasks")
      .select("*")
      .eq("user_id", this.userId)
      .eq("id", id)
      .maybeSingle();
    if (taskError) {
      throw new ExternalServiceError("supabase");
    }
    if (!task || task.status === "completed") {
      return null;
    }
    const startedAt = task.started_at ?? at;
    if (!task.started_at) {
      const { error: sessionError } = await this.client
        .from("task_sessions")
        .insert({
          user_id: this.userId,
          task_id: id,
          started_at: startedAt,
        });
      if (sessionError) {
        throw new ExternalServiceError("supabase");
      }
    }
    const { data, error } = await this.client
      .from("tasks")
      .update({ status: "in_progress", started_at: startedAt })
      .eq("user_id", this.userId)
      .eq("id", id)
      .select("*")
      .single();
    return mapTask(assertResult(data, error));
  }

  async completeTask(
    id: string,
    at = new Date().toISOString(),
  ): Promise<TaskRecord | null> {
    const { data: task, error: taskError } = await this.client
      .from("tasks")
      .select("*")
      .eq("user_id", this.userId)
      .eq("id", id)
      .maybeSingle();
    if (taskError) {
      throw new ExternalServiceError("supabase");
    }
    if (!task) {
      return null;
    }
    const startedAt = task.started_at ?? at;
    const elapsedMinutes = Math.max(
      0,
      Math.round(
        (new Date(at).getTime() - new Date(startedAt).getTime()) / 60000,
      ),
    );
    const { data: session } = await this.client
      .from("task_sessions")
      .select("id")
      .eq("user_id", this.userId)
      .eq("task_id", id)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (session) {
      const { error: sessionError } = await this.client
        .from("task_sessions")
        .update({ ended_at: at, elapsed_minutes: elapsedMinutes })
        .eq("user_id", this.userId)
        .eq("id", session.id);
      if (sessionError) {
        throw new ExternalServiceError("supabase");
      }
    }
    const { data, error } = await this.client
      .from("tasks")
      .update({
        status: "completed",
        started_at: startedAt,
        completed_at: at,
        elapsed_minutes: elapsedMinutes,
      })
      .eq("user_id", this.userId)
      .eq("id", id)
      .select("*")
      .single();
    return mapTask(assertResult(data, error));
  }

  async saveReplyDraft(
    messageId: string,
    subject: string,
    bodyText: string,
  ): Promise<ReplyDraftRecord> {
    const { data, error } = await this.client
      .from("reply_drafts")
      .insert({
        user_id: this.userId,
        message_id: messageId,
        subject,
        body_text: bodyText,
        status: "draft",
      })
      .select("*")
      .single();
    return mapDraft(assertResult(data, error));
  }

  async getReplyDraft(id: string): Promise<ReplyDraftRecord | null> {
    const { data, error } = await this.client
      .from("reply_drafts")
      .select("*")
      .eq("user_id", this.userId)
      .eq("id", id)
      .maybeSingle();
    if (error) {
      throw new ExternalServiceError("supabase");
    }
    return data ? mapDraft(data) : null;
  }

  async markReplySent(id: string, providerMessageId: string): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await this.client
      .from("reply_drafts")
      .update({
        status: "sent",
        approved_at: now,
        sent_at: now,
        provider_message_id: providerMessageId,
      })
      .eq("user_id", this.userId)
      .eq("id", id);
    if (error) {
      throw new ExternalServiceError("supabase");
    }
  }

  async saveReview(input: ReviewInput): Promise<DailyReviewRecord> {
    const { data, error } = await this.client
      .from("daily_reviews")
      .upsert(
        {
          user_id: this.userId,
          review_date: input.date,
          goal: input.goal,
          result: input.result,
          good_job: input.goodJob,
          bad_job: input.badJob,
          rules: input.rules,
          improvements: input.improvements,
          cheer: input.cheer,
        },
        { onConflict: "user_id,review_date" },
      )
      .select("*")
      .single();
    return mapReview(assertResult(data, error));
  }

  async getReview(date: string): Promise<DailyReviewRecord | null> {
    const { data, error } = await this.client
      .from("daily_reviews")
      .select("*")
      .eq("user_id", this.userId)
      .eq("review_date", date)
      .maybeSingle();
    if (error) {
      throw new ExternalServiceError("supabase");
    }
    return data ? mapReview(data) : null;
  }

  async saveReviewExport(id: string, html: string): Promise<void> {
    const { error } = await this.client
      .from("daily_reviews")
      .update({ exported_html: html })
      .eq("user_id", this.userId)
      .eq("id", id);
    if (error) {
      throw new ExternalServiceError("supabase");
    }
  }

  async listActivities(
    limit: number,
    correlationId?: string,
  ): Promise<ActivityRecord[]> {
    let query = this.client
      .from("activity_logs")
      .select("*")
      .eq("user_id", this.userId)
      .order("ts", { ascending: false })
      .limit(limit);
    if (correlationId) {
      query = query.eq("correlation_id", correlationId);
    }
    const { data, error } = await query;
    return assertResult(data, error).map((row: ActivityRow) => ({
      id: row.id,
      ts: row.ts,
      level: row.level,
      operation: row.operation,
      message: row.message,
      correlationId: row.correlation_id ?? undefined,
      context: row.context ?? {},
      humanNote: row.human_note ?? undefined,
      aiTodo: row.ai_todo ?? undefined,
    }));
  }

  async saveCalendarEvent(
    input: CalendarEventInput,
  ): Promise<CalendarEventRecord> {
    const { data, error } = await this.client
      .from("calendar_events")
      .upsert(
        {
          user_id: this.userId,
          provider_event_id: input.providerEventId ?? null,
          source_message_id: input.sourceMessageId ?? null,
          title: input.title,
          description: input.description ?? null,
          start_at: input.startAt,
          end_at: input.endAt,
          timezone: input.timezone,
          status: input.status,
          location: input.location ?? null,
          html_link: input.htmlLink ?? null,
          conflict_warning: input.conflictWarning,
        },
        { onConflict: "user_id,provider_event_id" },
      )
      .select("*")
      .single();
    return mapEvent(assertResult(data, error));
  }

  async saveStyleProfile(
    profile: MailStyleProfile,
    sampleCount: number,
  ): Promise<void> {
    const { error } = await this.client.from("mail_style_profiles").upsert(
      {
        user_id: this.userId,
        greeting: profile.greeting,
        closing: profile.closing,
        formality: profile.formality,
        average_length: profile.averageLength,
        uses_emoji: profile.usesEmoji,
        notes: profile.notes,
        sample_count: sampleCount,
        learned_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) {
      throw new ExternalServiceError("supabase");
    }
  }

  async getStyleProfile(): Promise<MailStyleProfile | null> {
    const { data, error } = await this.client
      .from("mail_style_profiles")
      .select("*")
      .eq("user_id", this.userId)
      .maybeSingle();
    if (error) {
      throw new ExternalServiceError("supabase");
    }
    if (!data) {
      return null;
    }
    return {
      greeting: data.greeting,
      closing: data.closing,
      formality: data.formality,
      averageLength: data.average_length,
      usesEmoji: data.uses_emoji,
      notes: data.notes ?? [],
    };
  }
}

export type RepositoryContext = {
  repository: TotonouRepository;
  userId?: string;
  providerAccessToken?: string;
  authenticated: boolean;
  demo: boolean;
};

export async function getRepositoryContext(): Promise<RepositoryContext> {
  const auth = await getAuthContext();
  if (auth.authenticated && auth.userId) {
    const client = await createSupabaseServerClient();
    if (client) {
      return {
        repository: new SupabaseTotonouRepository(client, auth.userId),
        userId: auth.userId,
        providerAccessToken: auth.providerAccessToken,
        authenticated: true,
        demo: false,
      };
    }
  }

  if (auth.userId) {
    const admin = getSupabaseAdminClient();
    if (admin) {
      return {
        repository: new SupabaseTotonouRepository(admin, auth.userId),
        userId: auth.userId,
        providerAccessToken: auth.providerAccessToken,
        authenticated: false,
        demo: false,
      };
    }
  }

  return {
    repository: new DemoTotonouRepository(),
    userId: auth.userId,
    providerAccessToken: auth.providerAccessToken,
    authenticated: auth.authenticated,
    demo: true,
  };
}
