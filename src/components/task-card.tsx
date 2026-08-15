"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import {
  Brain,
  Check,
  Circle,
  CircleAlert,
  Clock3,
  Mail,
  Play,
  Sun,
  Zap,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { Task } from "@/lib/types"
import { cn } from "@/lib/utils"

const priorityMeta = {
  urgent: { label: "今すぐ", icon: CircleAlert, className: "text-priority-now" },
  today: { label: "今日中", icon: Sun, className: "text-priority-today" },
  anytime: { label: "いつでも", icon: Circle, className: "text-muted-foreground" },
} as const

const typeMeta = {
  sukima: { label: "すきま", icon: Zap },
  jikkuri: { label: "じっくり", icon: Brain },
} as const

function elapsedLabel(task: Task, tick: number) {
  if (task.status === "completed") return `${task.elapsedMinutes ?? 0}分`
  if (task.status !== "in_progress" || !task.startedAt) return `見積 ${task.estimatedMinutes}分`
  const seconds = Math.max(0, Math.floor((tick - Date.parse(task.startedAt)) / 1000))
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
}

export function TaskCard({
  task,
  hasOtherActiveTask,
  onStart,
  onComplete,
}: {
  task: Task
  hasOtherActiveTask: boolean
  onStart: (id: string) => void
  onComplete: (id: string) => void
}) {
  const [tick, setTick] = useState(0)
  const priority = priorityMeta[task.priority]
  const nature = typeMeta[task.taskType]
  const PriorityIcon = priority.icon
  const NatureIcon = nature.icon

  useEffect(() => {
    if (task.status !== "in_progress") return
    const update = () => setTick(Date.now())
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [task.status])

  const completed = task.status === "completed"
  const active = task.status === "in_progress"

  return (
    <article
      className={cn(
        "group rounded-xl border bg-card px-3 py-3 transition-[border-color,box-shadow,opacity] hover:border-foreground/15 hover:shadow-sm sm:px-4",
        active && "border-primary/45 bg-secondary/30 shadow-sm",
        completed && "opacity-60",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-muted",
            active && "bg-primary text-primary-foreground",
          )}
        >
          {completed ? (
            <Check className="size-4" aria-hidden="true" />
          ) : (
            <PriorityIcon className={cn("size-4", !active && priority.className)} aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn("text-sm font-medium leading-snug", completed && "line-through")}>
              {task.title}
            </span>
            {task.source === "email" ? (
              <Badge variant="outline" className="h-4.5 px-1.5 text-[0.58rem]">
                <Mail className="size-2.5" aria-hidden="true" />
                {task.emailAction === "reply" ? "要返信" : "メール"}
              </Badge>
            ) : null}
          </div>
          {task.notes ? <p className="mt-1 line-clamp-2 text-[0.68rem] leading-relaxed text-muted-foreground">{task.notes}</p> : null}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.62rem] text-muted-foreground">
            <span className={cn("inline-flex items-center gap-1", priority.className)}>
              <PriorityIcon className="size-3" aria-hidden="true" />
              {priority.label}
            </span>
            <span className="inline-flex items-center gap-1">
              <NatureIcon className="size-3" aria-hidden="true" />
              {nature.label}
            </span>
            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
              <Clock3 className="size-3" aria-hidden="true" />
              {elapsedLabel(task, tick)}
            </span>
            {task.messageId ? (
              <Link href={`/messages/${task.messageId}`} className="text-primary underline-offset-2 hover:underline">
                元メールを見る
              </Link>
            ) : null}
          </div>
        </div>
        {!completed ? (
          active ? (
            <Button size="sm" onClick={() => onComplete(task.id)} className="shrink-0">
              <Check data-icon="inline-start" />
              完了
            </Button>
          ) : (
            <Button
              size="icon"
              variant="outline"
              onClick={() => onStart(task.id)}
              disabled={hasOtherActiveTask}
              aria-label={`${task.title}を開始`}
              className="shrink-0 rounded-full"
            >
              <Play className="ml-0.5" aria-hidden="true" />
            </Button>
          )
        ) : null}
      </div>
    </article>
  )
}
