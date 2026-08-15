"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import {
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileText,
  History,
  Inbox,
  ListChecks,
  MailCheck,
} from "lucide-react"

import { useApp } from "@/components/app-provider"
import { ScreenHeading } from "@/components/screen-heading"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { ActivityLog, ActivityOperation } from "@/lib/types"
import { cn } from "@/lib/utils"

type ActivityFilter = "all" | "mail" | "task" | "review"

const operationLabels: Partial<Record<ActivityOperation, string>> = {
  fetch_mail_batch_start: "メール確認を開始",
  fetch_mail_batch_complete: "メール確認が完了",
  triage_exclude_rule: "除外ルールを適用",
  triage_classify: "AIがメールを分類",
  task_create: "タスクを作成",
  task_start: "タスクを開始",
  task_complete: "タスクを完了",
  task_carry_over: "明日に持ち越し",
  reply_draft_generate: "返信案を生成",
  reply_send: "返信を送信",
  mark_as_read: "元メールを既読化",
  review_generate: "日報下書きを生成",
  weekly_review_generate: "週の振り返りを生成",
  praise_draft_generate: "自分褒めを生成",
  coach_notify: "声かけを表示",
  api_error: "外部連携エラー",
}

function groupKind(operation: ActivityOperation): Exclude<ActivityFilter, "all"> {
  if (operation.startsWith("fetch_") || operation.startsWith("triage_") || operation.startsWith("reply_") || operation === "mark_as_read") return "mail"
  if (operation.startsWith("task_") || operation === "coach_notify") return "task"
  return "review"
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value))
}

function valueNumber(value: unknown) {
  return typeof value === "number" ? value : 0
}

function mailSummary(logs: readonly ActivityLog[]) {
  const completed = logs.find((log) => log.operation === "fetch_mail_batch_complete")
  if (!completed) return null
  const fetched = valueNumber(completed.context.fetched_count)
  const classified = valueNumber(completed.context.classified_count)
  const tasks = valueNumber(completed.context.task_candidate_count)
  const excluded = logs
    .filter((log) => log.operation === "triage_exclude_rule")
    .reduce((sum, log) => sum + valueNumber(log.context.excluded_count), 0)
  return `${fetched}件取得 → ${excluded}件除外 → ${classified}件分類 → ${tasks}件をタスク候補に`
}

function LogIcon({ operation }: { operation: ActivityOperation }) {
  const className = "size-3.5"
  if (operation.startsWith("fetch_") || operation.startsWith("triage_")) return <MailCheck className={className} />
  if (operation.startsWith("task_")) return <ListChecks className={className} />
  if (operation.startsWith("review_") || operation.startsWith("weekly_")) return <FileText className={className} />
  if (operation === "api_error") return <CircleAlert className={className} />
  return <Bot className={className} />
}

export function ActivityScreen() {
  const { state } = useApp()
  const [filter, setFilter] = useState<ActivityFilter>("all")
  const groups = useMemo(() => {
    const map = new Map<string, ActivityLog[]>()
    state.activityLogs.forEach((log) => {
      const key = log.correlationId ?? `single_${log.id}`
      map.set(key, [...(map.get(key) ?? []), log])
    })
    return [...map.entries()]
      .map(([id, logs]) => ({ id, logs: logs.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts)) }))
      .filter((group) => filter === "all" || group.logs.some((log) => groupKind(log.operation) === filter))
      .sort((a, b) => Date.parse(b.logs.at(-1)?.ts ?? "") - Date.parse(a.logs.at(-1)?.ts ?? ""))
  }, [filter, state.activityLogs])

  const mailRuns = new Set(state.activityLogs.map((log) => log.correlationId).filter(Boolean)).size
  const completedTasks = state.activityLogs.filter((log) => log.operation === "task_complete").length
  const generatedReviews = state.activityLogs.filter((log) => log.operation === "review_generate").length

  return (
    <div>
      <ScreenHeading
        eyebrow="ACTIVITY LOG"
        title="処理履歴"
        description="Totonouが何を取得し、何を除外し、何をタスクにしたかを相関IDごとに追えます。"
        icon={History}
        action={<Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}><Inbox />朝へ戻る</Link>}
      />

      <div className="mb-5 grid grid-cols-3 gap-2">
        {[
          { label: "メール確認", value: mailRuns, icon: MailCheck },
          { label: "タスク完了", value: completedTasks, icon: CheckCircle2 },
          { label: "日報生成", value: generatedReviews, icon: FileText },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label} className="py-3">
            <CardContent className="px-3 text-center">
              <Icon className="mx-auto size-3.5 text-primary" aria-hidden="true" />
              <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
              <p className="text-[0.58rem] text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="履歴フィルター">
        {[
          ["all", "すべて"],
          ["mail", "メール"],
          ["task", "タスク"],
          ["review", "振り返り"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value as ActivityFilter)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[0.65rem] text-muted-foreground transition-colors hover:bg-muted",
              filter === value && "border-primary/25 bg-secondary text-secondary-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {groups.map((group) => {
          const first = group.logs[0]
          const last = group.logs.at(-1) ?? first
          const summary = mailSummary(group.logs)
          return (
            <Card key={group.id} className="py-0">
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 sm:px-5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
                    <LogIcon operation={last.operation} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-medium">{summary ?? operationLabels[last.operation] ?? last.message}</p>
                      {group.logs.length > 1 ? <Badge variant="secondary">{group.logs.length}段階</Badge> : null}
                    </div>
                    <p className="mt-1 flex items-center gap-1 text-[0.6rem] text-muted-foreground">
                      <Clock3 className="size-3" aria-hidden="true" />
                      {timeLabel(first.ts)}
                      {first.correlationId ? <span className="font-mono">・{first.correlationId.slice(0, 18)}</span> : null}
                    </p>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden="true" />
                </summary>
                <div className="border-t px-4 py-3 sm:px-5">
                  <ol className="relative ml-3 space-y-0 border-l">
                    {group.logs.map((log) => (
                      <li key={log.id} className="relative pb-4 pl-5 last:pb-0">
                        <span className={cn("absolute -left-1.5 top-1.5 size-3 rounded-full border-2 border-card bg-primary", log.level === "ERROR" && "bg-destructive")} />
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[0.7rem] font-medium">{operationLabels[log.operation] ?? log.message}</p>
                            <p className="mt-0.5 font-mono text-[0.56rem] text-muted-foreground">{log.operation}</p>
                          </div>
                          <span className="shrink-0 font-mono text-[0.56rem] text-muted-foreground">{timeLabel(log.ts)}</span>
                        </div>
                        {Object.keys(log.context).length ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {Object.entries(log.context).map(([key, value]) => (
                              <span key={key} className="rounded-md bg-muted px-2 py-1 font-mono text-[0.55rem] text-muted-foreground">
                                {key}: {typeof value === "object" ? JSON.stringify(value) : String(value)}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </div>
              </details>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
