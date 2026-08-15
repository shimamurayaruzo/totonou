import { CalendarClock, Timer } from "lucide-react"

import type { CalendarEvent, Task } from "@/lib/types"
import { cn } from "@/lib/utils"

const startHour = 6
const endHour = 23
const totalMinutes = (endHour - startHour) * 60
const labels = [6, 9, 12, 15, 18, 21, 23]

function minutesInTokyo(timestamp: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp))
  const value = (type: "hour" | "minute") => Number(parts.find((part) => part.type === type)?.value ?? 0)
  return value("hour") * 60 + value("minute")
}

function position(startAt: string, endAt: string) {
  const start = Math.max(startHour * 60, minutesInTokyo(startAt))
  const end = Math.min(endHour * 60, minutesInTokyo(endAt))
  return {
    left: `${((start - startHour * 60) / totalMinutes) * 100}%`,
    width: `${Math.max(1.5, ((Math.max(start + 10, end) - start) / totalMinutes) * 100)}%`,
  }
}

function timeLabel(timestamp: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp))
}

export function TimeGrid({ events, tasks }: { events: readonly CalendarEvent[]; tasks: readonly Task[] }) {
  const tracked = tasks.filter((task) => task.startedAt && task.completedAt)
  const rows = [
    ...events.map((event) => ({
      id: event.id,
      label: event.title,
      startAt: event.startAt,
      endAt: event.endAt,
      kind: "plan" as const,
    })),
    ...tracked.map((task) => ({
      id: task.id,
      label: task.title,
      startAt: task.startedAt!,
      endAt: task.completedAt!,
      kind: "actual" as const,
    })),
  ]

  return (
    <div className="overflow-x-auto pb-1">
      <div className="min-w-[620px]">
        <div className="relative ml-24 h-5 border-b text-[0.58rem] text-muted-foreground">
          {labels.map((hour) => (
            <span
              key={hour}
              className="absolute -translate-x-1/2 font-mono"
              style={{ left: `${((hour - startHour) / (endHour - startHour)) * 100}%` }}
            >
              {hour}:00
            </span>
          ))}
        </div>
        <div className="divide-y">
          {rows.map((row) => (
            <div key={`${row.kind}-${row.id}`} className="flex min-h-10 items-center">
              <div className="flex w-24 shrink-0 items-center gap-1.5 pr-3 text-[0.62rem] text-muted-foreground">
                {row.kind === "plan" ? <CalendarClock className="size-3" /> : <Timer className="size-3" />}
                {row.kind === "plan" ? "予定" : "実績"}
              </div>
              <div
                className="relative h-10 flex-1 bg-[repeating-linear-gradient(to_right,transparent_0,transparent_calc(17.647%-1px),var(--border)_17.647%)]"
                aria-label={`${row.label} ${timeLabel(row.startAt)}から${timeLabel(row.endAt)}`}
              >
                <div
                  className={cn(
                    "absolute top-2 flex h-6 items-center overflow-hidden rounded-md px-2 text-[0.6rem] font-medium whitespace-nowrap",
                    row.kind === "plan" ? "border border-primary/20 bg-primary/10 text-primary" : "bg-primary text-primary-foreground",
                  )}
                  style={position(row.startAt, row.endAt)}
                  title={`${row.label} ${timeLabel(row.startAt)}–${timeLabel(row.endAt)}`}
                >
                  {row.label}
                </div>
              </div>
            </div>
          ))}
          {rows.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">表示できる予定・実績はありません。</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
