"use client"

import { createContext, useContext, useMemo, useSyncExternalStore } from "react"

import {
  getServerStoreSnapshot,
  getStoreSnapshot,
  resetStore,
  setStoreState,
  subscribeStore,
} from "@/lib/client-store"
import { completeTask as completeTaskList, startTask as startTaskList } from "@/lib/domain/tasks"
import type {
  ActivityLog,
  ActivityOperation,
  AppState,
  CalendarEvent,
  DailyReview,
  JsonObject,
  PraisePostStatus,
  Settings,
  Task,
  TaskPriority,
  TaskType,
} from "@/lib/types"

export interface ActionResult {
  readonly ok: boolean
  readonly message: string
}

interface AddTaskInput {
  readonly title: string
  readonly priority: TaskPriority
  readonly taskType: TaskType
  readonly estimatedMinutes?: number
}

interface CalendarInput {
  readonly title: string
  readonly description?: string
  readonly location?: string
  readonly startAt: string
  readonly endAt: string
}

type ReviewPatch = Partial<
  Pick<DailyReview, "goal" | "result" | "goodJob" | "badJob" | "rules" | "improvements" | "cheer" | "status" | "exportedHtml">
>

type SettingsPatch = Partial<
  Pick<Settings, "dreams" | "monthlyGoals" | "fetchRange" | "coachPersona" | "markAsRead" | "domainAllowlist" | "domainBlocklist">
>

interface AppContextValue {
  readonly state: AppState
  readonly addTask: (input: AddTaskInput) => ActionResult
  readonly startTask: (taskId: string) => ActionResult
  readonly completeTask: (taskId: string) => ActionResult
  readonly syncMail: () => Promise<ActionResult>
  readonly saveSettings: (patch: SettingsPatch) => void
  readonly saveReview: (patch: ReviewPatch) => DailyReview
  readonly carryOverTasks: (taskIds: readonly string[]) => number
  readonly scheduleEvent: (input: CalendarInput) => CalendarEvent
  readonly markMessageRead: (messageId: string) => void
  readonly savePraisePost: (id: string, text: string, status: PraisePostStatus) => void
  readonly notifyCoach: (trigger: "start" | "pomodoro" | "idle") => void
  readonly resetDemo: () => void
}

const AppContext = createContext<AppContextValue | null>(null)

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`
}

function now() {
  return new Date().toISOString()
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function activityLog(
  state: AppState,
  operation: ActivityOperation,
  message: string,
  context: JsonObject,
  correlationId: string | null = null,
): ActivityLog {
  return {
    id: id("log"),
    userId: state.userId,
    ts: now(),
    level: "INFO",
    operation,
    message,
    correlationId,
    context,
    humanNote: null,
    aiTodo: null,
  }
}

function appendLog(
  state: AppState,
  operation: ActivityOperation,
  message: string,
  context: JsonObject,
  correlationId: string | null = null,
): AppState {
  return {
    ...state,
    activityLogs: [activityLog(state, operation, message, context, correlationId), ...state.activityLogs],
  }
}

function addTask(input: AddTaskInput): ActionResult {
  const title = input.title.trim()
  if (!title) return { ok: false, message: "タスク名を入力してください。" }
  setStoreState((state) => {
    const timestamp = now()
    const task: Task = {
      id: id("task"),
      userId: state.userId,
      source: "manual",
      messageId: null,
      calendarEventId: null,
      emailAction: null,
      title,
      notes: "",
      priority: input.priority,
      taskType: input.taskType,
      status: "pending",
      estimatedMinutes: input.estimatedMinutes ?? (input.taskType === "sukima" ? 10 : 30),
      elapsedMinutes: null,
      startedAt: null,
      completedAt: null,
      dueDate: state.asOfDate,
      carriedOverFrom: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    return appendLog(
      { ...state, tasks: [task, ...state.tasks] },
      "task_create",
      "手動タスクを作成",
      { task_id: task.id, source: "manual" },
    )
  })
  return { ok: true, message: "タスクを追加しました。" }
}

function startTask(taskId: string): ActionResult {
  try {
    setStoreState((state) => {
      const timestamp = now()
      const tasks = startTaskList(state.tasks, taskId, timestamp)
      return appendLog({ ...state, tasks }, "task_start", "タスクを開始", { task_id: taskId })
    })
    return { ok: true, message: "計測を開始しました。" }
  } catch {
    return { ok: false, message: "実行中のタスクを先に完了してください。" }
  }
}

function completeTask(taskId: string): ActionResult {
  try {
    setStoreState((state) => {
      const timestamp = now()
      const tasks = completeTaskList(state.tasks, taskId, timestamp)
      const completed = tasks.find((task) => task.id === taskId)
      let next: AppState = { ...state, tasks }
      next = appendLog(next, "task_complete", "タスクを完了", {
        task_id: taskId,
        elapsed_min: completed?.elapsedMinutes ?? 0,
      })
      if (completed?.messageId && state.settings.markAsRead) {
        next = {
          ...next,
          messages: next.messages.map((message) =>
            message.messageId === completed.messageId ? { ...message, isUnread: false } : message,
          ),
        }
        next = appendLog(next, "mark_as_read", "元メールを既読化", {
          message_id: completed.messageId,
          success: true,
        })
      }
      return next
    })
    return { ok: true, message: "完了しました。実績時間を記録しました。" }
  } catch {
    return { ok: false, message: "開始してから完了してください。" }
  }
}

async function syncMail(): Promise<ActionResult> {
  const correlationId = `chk_${crypto.randomUUID()}`
  setStoreState((state) =>
    appendLog(state, "fetch_mail_batch_start", "メール確認を開始", {
      fetch_range: state.settings.fetchRange,
      query_kind: "unread_recent",
    }, correlationId),
  )
  try {
    const response = await fetch("/api/mail/fetch", { method: "POST" })
    if (!response.ok) throw new Error("mail sync failed")
    setStoreState((state) =>
      appendLog(state, "fetch_mail_batch_complete", "メール確認が完了", {
        fetched_count: state.messages.length,
        classified_count: state.messages.filter((message) => message.triageResult).length,
        task_candidate_count: state.tasks.filter((task) => task.source === "email").length,
      }, correlationId),
    )
    return { ok: true, message: "メールを確認し、今日のタスクを更新しました。" }
  } catch {
    setStoreState((state) =>
      appendLog(state, "fetch_mail_batch_complete", "デモデータでメール確認を完了", {
        fetched_count: state.messages.length,
        classified_count: state.messages.filter((message) => message.triageResult).length,
        task_candidate_count: state.tasks.filter((task) => task.source === "email").length,
      }, correlationId),
    )
    return { ok: true, message: "デモデータでメール確認を完了しました。" }
  }
}

function saveSettings(patch: SettingsPatch) {
  setStoreState((state) => ({
    ...state,
    settings: { ...state.settings, ...patch, updatedAt: now() },
  }))
}

function todayReview(state: AppState): DailyReview {
  const existing = state.dailyReviews.find((review) => review.date === state.asOfDate)
  if (existing) return existing
  const timestamp = now()
  const tasks = state.tasks.filter(
    (task) => task.dueDate === state.asOfDate && task.status !== "cancelled" && task.status !== "carried_over",
  )
  const completed = tasks.filter((task) => task.status === "completed")
  return {
    id: id("review"),
    userId: state.userId,
    date: state.asOfDate,
    status: "draft",
    goal: state.settings.monthlyGoals[0] ?? "今日の大切な仕事を一つ終える",
    result: `${completed.length}件を完了しました。動いた事実は記録に残っています。`,
    goodJob: completed.length ? `${completed.map((task) => task.title).join("、")}を完了できました。` : "今日始めたことを振り返りました。",
    badJob: "急ぎの連絡に引っ張られ、じっくり取り組む前の準備が遅れました。",
    rules: "メール確認は朝と夕方の二回にまとめる。",
    improvements: "じっくりタスクを午前の集中帯に置き、すきまタスクは移動前後に寄せましょう。",
    cheer: "開いて振り返った時点で十分です。明日のリストは、今日の自分が整えておきます。",
    scheduleComparison: tasks.map((task) => ({
      id: `comparison_${task.id}`,
      label: task.title,
      source: "task",
      plannedMinutes: task.estimatedMinutes,
      actualMinutes: task.elapsedMinutes ?? 0,
      status: task.status === "completed" ? "completed" : "pending",
    })),
    sourceTaskIds: tasks.map((task) => task.id),
    sourceLogIds: state.activityLogs.filter((log) => log.ts.slice(0, 10) === state.asOfDate).map((log) => log.id),
    exportedHtml: null,
    generatedAt: timestamp,
    updatedAt: timestamp,
  }
}

function saveReview(patch: ReviewPatch): DailyReview {
  let saved!: DailyReview
  setStoreState((state) => {
    const current = todayReview(state)
    saved = { ...current, ...patch, updatedAt: now() }
    const hasCurrent = state.dailyReviews.some((review) => review.id === current.id)
    const dailyReviews = hasCurrent
      ? state.dailyReviews.map((review) => (review.id === current.id ? saved : review))
      : [saved, ...state.dailyReviews]
    return appendLog({ ...state, dailyReviews }, "review_generate", "日報下書きを保存", {
      date: state.asOfDate,
      tasks_done: saved.scheduleComparison.filter((item) => item.status === "completed").length,
      total_min: saved.scheduleComparison.reduce((sum, item) => sum + item.actualMinutes, 0),
    })
  })
  return saved
}

function carryOverTasks(taskIds: readonly string[]) {
  const selected = new Set(taskIds)
  let count = 0
  setStoreState((state) => {
    const timestamp = now()
    const nextDate = addDays(state.asOfDate, 1)
    const carried: Task[] = []
    const tasks: Task[] = state.tasks.map((task) => {
      if (!selected.has(task.id) || !["pending", "in_progress"].includes(task.status)) return task
      count += 1
      carried.push({
        ...task,
        id: id("task"),
        status: "pending",
        elapsedMinutes: null,
        startedAt: null,
        completedAt: null,
        dueDate: nextDate,
        carriedOverFrom: task.id,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      return { ...task, status: "carried_over" as const, updatedAt: timestamp }
    })
    let next: AppState = { ...state, tasks: [...tasks, ...carried] }
    for (const task of carried) {
      next = appendLog(next, "task_carry_over", "未完了タスクを翌日に持ち越し", {
        task_id: task.id,
        source_task_id: task.carriedOverFrom,
      })
    }
    return next
  })
  return count
}

function scheduleEvent(input: CalendarInput) {
  let created!: CalendarEvent
  setStoreState((state) => {
    const timestamp = now()
    created = {
      id: id("event"),
      externalId: id("demo-calendar"),
      userId: state.userId,
      account: "gmail",
      title: input.title,
      description: input.description ?? "",
      location: input.location ?? "オンライン",
      startAt: input.startAt,
      endAt: input.endAt,
      allDay: false,
      status: "confirmed",
      sourceUrl: "#",
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    return { ...state, calendarEvents: [...state.calendarEvents, created] }
  })
  return created
}

function markMessageRead(messageId: string) {
  setStoreState((state) => ({
    ...state,
    messages: state.messages.map((message) =>
      message.messageId === messageId ? { ...message, isUnread: false } : message,
    ),
  }))
}

function savePraisePost(id: string, text: string, status: PraisePostStatus) {
  setStoreState((state) => ({
    ...state,
    praisePosts: state.praisePosts.map((post) =>
      post.id === id
        ? {
            ...post,
            text,
            status,
            updatedAt: now(),
            publishedAt: status === "published" ? now() : post.publishedAt,
          }
        : post,
    ),
  }))
}

function notifyCoach(trigger: "start" | "pomodoro" | "idle") {
  setStoreState((state) =>
    appendLog(state, "coach_notify", "声かけテキストを表示", {
      trigger,
      persona: state.settings.coachPersona,
      channel: "text",
    }),
  )
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const state = useSyncExternalStore(subscribeStore, getStoreSnapshot, getServerStoreSnapshot)
  const value = useMemo<AppContextValue>(
    () => ({
      state,
      addTask,
      startTask,
      completeTask,
      syncMail,
      saveSettings,
      saveReview,
      carryOverTasks,
      scheduleEvent,
      markMessageRead,
      savePraisePost,
      notifyCoach,
      resetDemo: resetStore,
    }),
    [state],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) throw new Error("useApp must be used within AppProvider")
  return context
}
