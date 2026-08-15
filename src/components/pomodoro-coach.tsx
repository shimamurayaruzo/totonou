"use client"

import { useEffect, useState } from "react"
import { BellRing, Coffee, Focus, TimerReset } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import type { CoachPersona, Task } from "@/lib/types"

const personaLines: Record<CoachPersona, Record<"focus" | "break", string>> = {
  gentle_secretary: {
    focus: "まずは25分、この仕事だけに集中しましょう。",
    break: "一区切りです。肩の力を抜いて、5分休みましょう。",
  },
  passionate_coach: {
    focus: "この25分で一歩進めよう。やることは一つだけです。",
    break: "よく集中しました。次に備えて、しっかり休憩です。",
  },
  butler: {
    focus: "ただいまより集中のお時間です。ほかのことはお預かりします。",
    break: "一区切りでございます。どうぞお休みください。",
  },
}

export function PomodoroCoach({
  task,
  persona,
  onNotify,
}: {
  task: Task
  persona: CoachPersona
  onNotify: (trigger: "start" | "pomodoro") => void
}) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const update = () => setTick(Date.now())
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [])

  const elapsed = task.startedAt ? Math.max(0, Math.floor((tick - Date.parse(task.startedAt)) / 1000)) : 0
  const cycleSeconds = 30 * 60
  const cycleElapsed = elapsed % cycleSeconds
  const isBreak = cycleElapsed >= 25 * 60
  const phaseSeconds = isBreak ? cycleElapsed - 25 * 60 : cycleElapsed
  const phaseLength = isBreak ? 5 * 60 : 25 * 60
  const remaining = Math.max(0, phaseLength - phaseSeconds)
  const sessions = Math.max(1, Math.ceil(task.estimatedMinutes / 25))
  const message = personaLines[persona][isBreak ? "break" : "focus"]

  const showPrompt = () => {
    onNotify(isBreak ? "pomodoro" : "start")
    toast(message)
  }

  return (
    <Card className="border-primary/20 bg-secondary/45 py-3 ring-primary/10">
      <CardContent className="flex items-center gap-3 px-3 sm:px-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
          {isBreak ? <Coffee className="size-4" aria-hidden="true" /> : <Focus className="size-4" aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">{task.title}</p>
              <p className="mt-0.5 text-[0.62rem] text-muted-foreground">
                {isBreak ? "休憩中" : `集中 ${sessions}セット予定`}
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 font-mono text-sm font-semibold tabular-nums text-primary">
              <TimerReset className="size-3.5" aria-hidden="true" />
              {String(Math.floor(remaining / 60)).padStart(2, "0")}:{String(remaining % 60).padStart(2, "0")}
            </span>
          </div>
          <Progress value={(phaseSeconds / phaseLength) * 100} className="mt-2 gap-0" aria-label="ポモドーロ進捗" />
        </div>
        <Button size="icon" variant="ghost" onClick={showPrompt} aria-label="今の声かけを表示">
          <BellRing aria-hidden="true" />
        </Button>
      </CardContent>
    </Card>
  )
}
