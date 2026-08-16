"use client"

import Link from "next/link"
import { FormEvent, useEffect, useMemo, useState } from "react"
import {
  ArrowRight,
  Brain,
  CalendarDays,
  CheckCircle2,
  Clock3,
  History,
  Inbox,
  LoaderCircle,
  MailCheck,
  Plus,
  Sparkles,
  SunMedium,
  Target,
  Zap,
} from "lucide-react"
import { toast } from "sonner"

import { useApp } from "@/components/app-provider"
import { PomodoroCoach } from "@/components/pomodoro-coach"
import { ScreenHeading } from "@/components/screen-heading"
import { TaskCard } from "@/components/task-card"
import { TimeGrid } from "@/components/time-grid"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { createThreeSecondSummary } from "@/lib/domain/tasks"
import type { TaskPriority, TaskType } from "@/lib/types"
import { cn } from "@/lib/utils"

const prioritySections = [
  { value: "urgent" as const, label: "今すぐ", description: "先に片付ける", color: "bg-priority-now" },
  { value: "today" as const, label: "今日中", description: "今日のうちに進める", color: "bg-priority-today" },
  { value: "anytime" as const, label: "いつでも", description: "余白で進める", color: "bg-muted-foreground" },
]

function dateLabel(date: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date(`${date}T00:00:00+09:00`))
}

function eventTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value))
}

export function BriefingScreen() {
  const {
    state,
    addTask,
    startTask,
    completeTask,
    refreshFromServer,
    syncMail,
    saveReview,
    notifyCoach,
  } = useApp()
  const [taskTitle, setTaskTitle] = useState("")
  const [priority, setPriority] = useState<TaskPriority>("today")
  const [taskType, setTaskType] = useState<TaskType>("sukima")
  const [filter, setFilter] = useState<"all" | TaskType>("all")
  const [syncing, setSyncing] = useState(false)
  const existingReview = state.dailyReviews.find((review) => review.date === state.asOfDate)
  const [goal, setGoal] = useState(existingReview?.goal ?? state.settings.monthlyGoals[0] ?? "")

  useEffect(() => {
    void refreshFromServer()
  }, [refreshFromServer])

  const dayTasks = useMemo(
    () =>
      state.tasks.filter(
        (task) =>
          task.dueDate === state.asOfDate &&
          task.status !== "cancelled" &&
          task.status !== "carried_over" &&
          (task.source !== "email" || task.emailAction === "reply"),
      ),
    [state.asOfDate, state.tasks],
  )
  const visibleTasks = filter === "all" ? dayTasks : dayTasks.filter((task) => task.taskType === filter)
  const activeTask = dayTasks.find((task) => task.status === "in_progress")
  const completed = visibleTasks.filter((task) => task.status === "completed")
  const openTasks = visibleTasks.filter((task) => task.status !== "completed")
  const events = state.calendarEvents.filter((event) => event.status !== "cancelled")
  const summary = createThreeSecondSummary(dayTasks, events, state.asOfDate, state.settings.timeZone)
  const lastSync = state.activityLogs.find((log) => log.operation === "fetch_mail_batch_complete")

  const handleStart = (taskId: string) => {
    const result = startTask(taskId)
    if (result.ok) {
      notifyCoach("start")
      toast.success(result.message)
    } else {
      toast.error(result.message)
    }
  }

  const handleComplete = (taskId: string) => {
    const result = completeTask(taskId)
    if (result.ok) {
      toast.success(result.message)
    } else {
      toast.error(result.message)
    }
  }

  const handleAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const result = addTask({ title: taskTitle, priority, taskType })
    if (result.ok) {
      setTaskTitle("")
      toast.success(result.message)
    } else {
      toast.error(result.message)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    const result = await syncMail()
    setSyncing(false)
    if (result.ok) {
      toast.success(result.message)
    } else {
      toast.error(result.message)
    }
  }

  const saveGoal = () => {
    saveReview({ goal: goal.trim() })
    toast.success("今日の目標を保存しました。")
  }

  return (
    <div>
      <ScreenHeading
        eyebrow={dateLabel(state.asOfDate)}
        title="朝のブリーフィング"
        description="予定とメールから、今日やることだけを整えました。"
        icon={SunMedium}
        action={
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing} className="hidden sm:inline-flex">
            {syncing ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <MailCheck data-icon="inline-start" />}
            メールを確認
          </Button>
        }
      />

      <div className="space-y-4">
        <Card className="relative overflow-hidden border-primary/15 bg-[linear-gradient(135deg,var(--card),color-mix(in_srgb,var(--accent)_70%,var(--card)))] py-5 ring-primary/5">
          <div className="pointer-events-none absolute -right-10 -top-14 size-44 rounded-full border border-primary/10" />
          <CardContent className="relative px-5 sm:px-6">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
                <Sparkles className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="eyebrow mb-1">3秒サマリー</p>
                <p className="text-balance text-base font-semibold leading-relaxed tracking-[-0.025em] sm:text-lg">
                  {summary.text}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  まずは一件。始めれば、今日の流れが整います。
                </p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2 border-t border-primary/10 pt-4 text-center">
              <div>
                <p className="text-lg font-semibold tabular-nums">{summary.eventCount}</p>
                <p className="text-[0.62rem] text-muted-foreground">予定</p>
              </div>
              <div>
                <p className="text-lg font-semibold tabular-nums">{summary.replyTaskCount}</p>
                <p className="text-[0.62rem] text-muted-foreground">要返信</p>
              </div>
              <div>
                <p className="text-lg font-semibold tabular-nums">{summary.estimatedRemainingMinutes}</p>
                <p className="text-[0.62rem] text-muted-foreground">残り見積・分</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {activeTask ? (
          <PomodoroCoach task={activeTask} persona={state.settings.coachPersona} onNotify={notifyCoach} />
        ) : null}

        <Card className="py-4">
          <CardContent className="px-4 sm:px-5">
            <label htmlFor="today-goal" className="mb-2 flex items-center gap-2 text-xs font-medium">
              <Target className="size-3.5 text-primary" aria-hidden="true" />
              今日の目標
            </label>
            <div className="flex gap-2">
              <Input
                id="today-goal"
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
                onBlur={saveGoal}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur()
                }}
                placeholder="今日、どんな一日にしますか"
                className="h-10 flex-1 bg-background/60"
              />
              <Button variant="secondary" onClick={saveGoal} className="h-10">
                保存
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="py-4">
          <CardHeader className="flex-row items-center justify-between px-4 sm:px-5">
            <div>
              <p className="eyebrow">CALENDAR</p>
              <CardTitle className="mt-1 flex items-center gap-2 text-sm">
                <CalendarDays className="size-4 text-primary" aria-hidden="true" />
                今日の予定
              </CardTitle>
            </div>
            <Badge variant="secondary">{events.length}件</Badge>
          </CardHeader>
          <CardContent className="mt-1 space-y-1 px-4 sm:px-5">
            {events.map((event) => (
              <a
                key={event.id}
                href={event.sourceUrl}
                target={event.sourceUrl.startsWith("http") ? "_blank" : undefined}
                rel={event.sourceUrl.startsWith("http") ? "noreferrer" : undefined}
                className="group flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted"
              >
                <span className="w-12 shrink-0 font-mono text-[0.68rem] tabular-nums text-primary">
                  {eventTime(event.startAt)}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-medium">{event.title}</span>
                <span className="hidden text-[0.62rem] text-muted-foreground sm:inline">{event.location}</span>
                <ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </a>
            ))}
            <details className="group mt-2 border-t pt-2">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-2 text-[0.68rem] font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                <Clock3 className="size-3.5" aria-hidden="true" />
                6時〜23時の時間軸を見る
              </summary>
              <div className="mt-2 rounded-lg border bg-background/50 p-3">
                <TimeGrid events={events} tasks={dayTasks} />
              </div>
            </details>
          </CardContent>
        </Card>

        <section aria-labelledby="tasks-heading" className="pt-2">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="eyebrow">TODAY&apos;S FOCUS</p>
              <h2 id="tasks-heading" className="mt-1 text-base font-semibold tracking-[-0.02em]">
                やること
              </h2>
            </div>
            <Tabs value={filter} onValueChange={(value) => setFilter(value as "all" | TaskType)}>
              <TabsList className="h-8">
                <TabsTrigger value="all" className="px-2 text-[0.68rem]">すべて</TabsTrigger>
                <TabsTrigger value="sukima" className="px-2 text-[0.68rem]"><Zap className="size-3" />すきま</TabsTrigger>
                <TabsTrigger value="jikkuri" className="px-2 text-[0.68rem]"><Brain className="size-3" />じっくり</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {summary.allTasksCompleted ? (
            <Card className="mb-3 border-primary/20 bg-secondary/40 py-6 text-center">
              <CardContent>
                <CheckCircle2 className="mx-auto size-7 text-primary" aria-hidden="true" />
                <p className="mt-2 text-sm font-semibold">今日は完了です</p>
                <p className="mt-1 text-xs text-muted-foreground">今日の自分に、お疲れさまを伝えましょう。</p>
              </CardContent>
            </Card>
          ) : null}

          <div className="space-y-5">
            {prioritySections.map((section) => {
              const tasks = openTasks.filter((task) => task.priority === section.value)
              if (!tasks.length) return null
              return (
                <div key={section.value}>
                  <div className="mb-2 flex items-center gap-2 px-1">
                    <span className={cn("size-2 rounded-full", section.color)} />
                    <h3 className="text-xs font-semibold">{section.label}</h3>
                    <span className="text-[0.62rem] text-muted-foreground">{section.description}</span>
                    <span className="ml-auto font-mono text-[0.62rem] text-muted-foreground">{tasks.length}</span>
                  </div>
                  <div className="space-y-2">
                    {tasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        hasOtherActiveTask={!!activeTask && activeTask.id !== task.id}
                        onStart={handleStart}
                        onComplete={handleComplete}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          <form onSubmit={handleAdd} className="mt-4 rounded-xl border border-dashed bg-card/55 p-3">
            <div className="flex items-center gap-2">
              <Plus className="size-4 shrink-0 text-primary" aria-hidden="true" />
              <Input
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
                placeholder="タスクを1行で追加"
                aria-label="新しいタスク"
                className="h-9 flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
              />
              <Button type="submit" size="sm">追加</Button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 border-t pt-2">
              <label className="flex items-center gap-1.5 text-[0.62rem] text-muted-foreground">
                優先度
                <select
                  value={priority}
                  onChange={(event) => setPriority(event.target.value as TaskPriority)}
                  className="h-7 rounded-md border bg-background px-2 text-[0.68rem] text-foreground"
                >
                  <option value="urgent">今すぐ</option>
                  <option value="today">今日中</option>
                  <option value="anytime">いつでも</option>
                </select>
              </label>
              <label className="flex items-center gap-1.5 text-[0.62rem] text-muted-foreground">
                性質
                <select
                  value={taskType}
                  onChange={(event) => setTaskType(event.target.value as TaskType)}
                  className="h-7 rounded-md border bg-background px-2 text-[0.68rem] text-foreground"
                >
                  <option value="sukima">すきま</option>
                  <option value="jikkuri">じっくり</option>
                </select>
              </label>
            </div>
          </form>

          {completed.length ? (
            <details className="mt-4 rounded-xl border bg-card/40">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-xs font-medium">
                <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
                完了したタスク
                <Badge variant="secondary" className="ml-auto">{completed.length}</Badge>
              </summary>
              <div className="space-y-2 border-t p-3">
                {completed.map((task) => (
                  <TaskCard key={task.id} task={task} hasOtherActiveTask={false} onStart={handleStart} onComplete={handleComplete} />
                ))}
              </div>
            </details>
          ) : null}
        </section>

        <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center">
          <Button onClick={handleSync} disabled={syncing} className="sm:hidden">
            {syncing ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <Inbox data-icon="inline-start" />}
            メールを確認する
          </Button>
          <Link href="/activity" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <History className="size-3.5" />
            処理履歴を見る
          </Link>
          <p className="text-[0.62rem] text-muted-foreground sm:ml-auto">
            {lastSync ? `最終確認 ${eventTime(lastSync.ts)}` : "まだメールを確認していません"}
          </p>
        </div>
      </div>
    </div>
  )
}
