"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import {
  ArrowLeft,
  CalendarClock,
  Check,
  Download,
  HeartHandshake,
  Lightbulb,
  LoaderCircle,
  MoonStar,
  RefreshCw,
  Scale,
  Sparkles,
  Target,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react"
import { toast } from "sonner"

import { useApp } from "@/components/app-provider"
import { ScreenHeading } from "@/components/screen-heading"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import type { DailyReview } from "@/lib/types"
import { cn } from "@/lib/utils"

type ReviewFields = Pick<DailyReview, "goal" | "result" | "goodJob" | "badJob" | "rules" | "improvements" | "cheer">

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

function fallbackHtml(date: string, fields: ReviewFields) {
  const sections = [
    ["今日の目標", fields.goal],
    ["今日の結果", fields.result],
    ["グッジョブ・感謝", fields.goodJob],
    ["バッジョブ・反省", fields.badJob],
    ["ルール化すること", fields.rules],
    ["改善策", fields.improvements],
    ["自分へのエール", fields.cheer],
  ]
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>Totonou 日報 ${escapeHtml(date)}</title><style>body{max-width:720px;margin:40px auto;padding:0 24px;color:#222a26;font-family:sans-serif;background:#f7f6f1}section{margin:16px 0;padding:20px;border:1px solid #dedbd2;border-radius:12px;background:#fff}h1{font-size:24px}h2{font-size:13px;color:#286f5a}p{white-space:pre-wrap;line-height:1.8}</style></head><body><h1>Totonou 日報</h1><p>${escapeHtml(date)}</p>${sections.map(([label, value]) => `<section><h2>${escapeHtml(label)}</h2><p>${escapeHtml(value)}</p></section>`).join("")}</body></html>`
}

function downloadHtml(html: string, date: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `totonou-report-${date}.html`
  anchor.click()
  URL.revokeObjectURL(url)
}

function reviewDefaults(state: ReturnType<typeof useApp>["state"]): ReviewFields {
  const tasks = state.tasks.filter((task) => task.dueDate === state.asOfDate)
  const completed = tasks.filter((task) => task.status === "completed")
  return {
    goal: state.settings.monthlyGoals[0] ?? "大切な仕事を一つ終える",
    result: `${completed.length}件を完了しました。予定したことと、動いた事実は残っています。`,
    goodJob: completed.length ? `${completed.map((task) => task.title).join("、")}を完了できました。` : "振り返りを開き、今日の事実を整理できました。",
    badJob: "急ぎの連絡へ反応するうちに、じっくりタスクへ手を伸ばすのが遅れました。",
    rules: "メール処理は朝と夕方の二回に固定し、日中は受信箱を開かない。",
    improvements: "じっくりタスクを午前の集中帯に置き、すきまタスクは移動前後に寄せましょう。",
    cheer: "開いてくれただけで十分です。明日のリストは、今日の自分が整えておきます。",
  }
}

function ReviewTextarea({
  label,
  hint,
  icon: Icon,
  value,
  onChange,
  tone,
}: {
  label: string
  hint: string
  icon: typeof Target
  value: string
  onChange: (value: string) => void
  tone?: "good" | "bad" | "advice"
}) {
  return (
    <Card className={cn("py-4", tone === "advice" && "border-primary/15 bg-secondary/25")}>
      <CardHeader className="px-4 sm:px-5">
        <div className="flex items-center gap-2">
          <Icon className={cn("size-3.5 text-muted-foreground", tone === "good" && "text-primary", tone === "bad" && "text-destructive", tone === "advice" && "text-primary")} />
          <CardTitle className="text-xs">{label}</CardTitle>
        </div>
        <p className="text-[0.62rem] text-muted-foreground">{hint}</p>
      </CardHeader>
      <CardContent className="px-4 sm:px-5">
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-24 resize-y bg-background/75 text-xs leading-relaxed"
        />
      </CardContent>
    </Card>
  )
}

export function ReviewScreen() {
  const { state, saveReview, carryOverTasks } = useApp()
  const existing = state.dailyReviews.find((review) => review.date === state.asOfDate)
  const [fields, setFields] = useState<ReviewFields>(existing ?? reviewDefaults(state))
  const [selectedCarryover, setSelectedCarryover] = useState<string[]>([])
  const [generating, setGenerating] = useState(false)
  const [exporting, setExporting] = useState(false)
  const tasks = useMemo(() => state.tasks.filter((task) => task.dueDate === state.asOfDate), [state.asOfDate, state.tasks])
  const incomplete = tasks.filter((task) => task.status === "pending" || task.status === "in_progress")
  const comparison = existing?.scheduleComparison ?? tasks.map((task) => ({
    id: task.id,
    label: task.title,
    plannedMinutes: task.estimatedMinutes,
    actualMinutes: task.elapsedMinutes ?? 0,
    status: task.status === "completed" ? "completed" : "pending",
  }))
  const completedMinutes = comparison.reduce((sum, item) => sum + item.actualMinutes, 0)
  const plannedMinutes = comparison.reduce((sum, item) => sum + item.plannedMinutes, 0)

  const updateField = (key: keyof ReviewFields, value: string) => setFields((current) => ({ ...current, [key]: value }))

  const generate = async () => {
    setGenerating(true)
    try {
      const response = await fetch("/api/review/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date: state.asOfDate }),
      })
      if (response.ok) {
        const data = await response.json() as { review?: Partial<ReviewFields> } & Partial<ReviewFields>
        const generated = data.review ?? data
        setFields((current) => ({ ...current, ...generated }))
      }
      toast.success("今日の実績から下書きを整えました。")
    } catch {
      toast.success("デモデータから下書きを整えました。")
    } finally {
      setGenerating(false)
    }
  }

  const save = () => {
    const carried = carryOverTasks(selectedCarryover)
    saveReview({ ...fields, status: "completed" })
    toast.success(carried ? `日報を保存し、${carried}件を明日に回しました。` : "日報を保存しました。")
  }

  const exportReport = async () => {
    setExporting(true)
    const saved = saveReview(fields)
    try {
      const response = await fetch("/api/review/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ review: saved }),
      })
      const html = response.ok ? await response.text() : fallbackHtml(state.asOfDate, fields)
      downloadHtml(html, state.asOfDate)
    } catch {
      downloadHtml(fallbackHtml(state.asOfDate, fields), state.asOfDate)
    } finally {
      setExporting(false)
      toast.success("日報HTMLを書き出しました。")
    }
  }

  return (
    <div>
      <ScreenHeading
        eyebrow={state.asOfDate}
        title="夜の振り返り"
        description="今日の事実をもとに、日報の八割を下書きしました。直したいところだけ整えてください。"
        icon={MoonStar}
        action={
          <Button variant="outline" size="sm" onClick={generate} disabled={generating}>
            {generating ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
            <span className="hidden sm:inline">AI下書きを更新</span>
          </Button>
        }
      />

      <div className="space-y-4">
        <Card className="py-4">
          <CardHeader className="px-4 sm:px-5">
            <div className="flex items-center gap-2">
              <Scale className="size-4 text-primary" aria-hidden="true" />
              <CardTitle className="text-sm">予定と実績</CardTitle>
              <Badge variant="secondary" className="ml-auto">実績 {completedMinutes}分</Badge>
            </div>
            <p className="text-[0.62rem] text-muted-foreground">見積 {plannedMinutes}分に対する、今日の記録です。</p>
          </CardHeader>
          <CardContent className="space-y-2 px-4 sm:px-5">
            {comparison.map((item) => {
              const max = Math.max(item.plannedMinutes, item.actualMinutes, 1)
              return (
                <div key={item.id} className="rounded-lg border bg-background/55 p-3">
                  <div className="flex items-center justify-between gap-3 text-[0.68rem]">
                    <span className="min-w-0 truncate font-medium">{item.label}</span>
                    <span className="shrink-0 font-mono text-muted-foreground">{item.plannedMinutes}分 / {item.actualMinutes}分</span>
                  </div>
                  <div className="mt-2 space-y-1">
                    <div className="h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-primary/25" style={{ width: `${(item.plannedMinutes / max) * 100}%` }} /></div>
                    <div className="h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(item.actualMinutes / max) * 100}%` }} /></div>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        <ReviewTextarea label="今日の目標" hint="朝に決めたこと" icon={Target} value={fields.goal} onChange={(value) => updateField("goal", value)} />
        <ReviewTextarea label="今日の結果" hint="実績から下書きした事実" icon={CalendarClock} value={fields.result} onChange={(value) => updateField("result", value)} />
        <ReviewTextarea label="グッジョブ・感謝" hint="うまくいったこと" icon={ThumbsUp} value={fields.goodJob} onChange={(value) => updateField("goodJob", value)} tone="good" />
        <ReviewTextarea label="バッジョブ・反省" hint="うまくいかなかったこと" icon={ThumbsDown} value={fields.badJob} onChange={(value) => updateField("badJob", value)} tone="bad" />
        <ReviewTextarea label="ルール化すること" hint="明日から続ける決め事" icon={Check} value={fields.rules} onChange={(value) => updateField("rules", value)} />
        <ReviewTextarea label="改善策" hint="AIからの具体的な提案" icon={Lightbulb} value={fields.improvements} onChange={(value) => updateField("improvements", value)} tone="advice" />

        {incomplete.length ? (
          <Card className="py-4">
            <CardHeader className="px-4 sm:px-5">
              <CardTitle className="text-xs">未完了タスクを明日に回しますか？</CardTitle>
              <p className="text-[0.62rem] text-muted-foreground">選んだタスクは、今日の記録を残したまま明日の一覧へ複製します。</p>
            </CardHeader>
            <CardContent className="space-y-1 px-4 sm:px-5">
              {incomplete.map((task) => (
                <label key={task.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 text-xs hover:bg-muted">
                  <input
                    type="checkbox"
                    checked={selectedCarryover.includes(task.id)}
                    onChange={(event) => setSelectedCarryover((current) => event.target.checked ? [...current, task.id] : current.filter((id) => id !== task.id))}
                    className="size-4 accent-primary"
                  />
                  <span className="min-w-0 flex-1 truncate">{task.title}</span>
                </label>
              ))}
            </CardContent>
          </Card>
        ) : null}

        <Card className="border-primary/10 bg-accent/65 py-5">
          <CardContent className="px-5">
            <div className="flex items-center gap-2">
              <HeartHandshake className="size-4 text-primary" aria-hidden="true" />
              <p className="eyebrow">励まし・自分へのエール</p>
            </div>
            <Textarea
              value={fields.cheer}
              onChange={(event) => updateField("cheer", event.target.value)}
              className="mt-3 min-h-16 resize-none border-0 bg-transparent px-0 text-sm leading-relaxed shadow-none focus-visible:ring-0"
            />
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row">
          <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <ArrowLeft className="size-3.5" />
            ブリーフィングに戻る
          </Link>
          <div className="flex gap-2 sm:ml-auto">
            <Button variant="outline" size="sm" onClick={exportReport} disabled={exporting} className="flex-1 sm:flex-none">
              {exporting ? <LoaderCircle className="animate-spin" /> : <Download />}
              日報をHTMLで書き出す
            </Button>
            <Button size="sm" onClick={save} className="flex-1 sm:flex-none">
              <Sparkles />
              保存
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
