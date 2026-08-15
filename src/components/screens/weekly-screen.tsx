"use client"

import { useMemo, useState } from "react"
import {
  CalendarRange,
  CheckCircle2,
  Clock3,
  Heart,
  LoaderCircle,
  MessageCircleHeart,
  Quote,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react"
import { toast } from "sonner"

import { useApp } from "@/components/app-provider"
import { ScreenHeading } from "@/components/screen-heading"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00+09:00`))
}

export function WeeklyScreen() {
  const { state, savePraisePost } = useApp()
  const weekly = state.weeklyReviews[0]
  const praise = state.praisePosts.find((post) => post.weeklyReviewId === weekly?.id) ?? state.praisePosts[0]
  const [praiseText, setPraiseText] = useState(praise?.text ?? "")
  const [generating, setGenerating] = useState(false)
  const daily = useMemo(
    () => [...state.dailyReviews].filter((review) => !weekly || weekly.sourceDailyReviewIds.includes(review.id)).sort((a, b) => a.date.localeCompare(b.date)),
    [state.dailyReviews, weekly],
  )

  if (!weekly || !praise) {
    return (
      <div>
        <ScreenHeading title="週の振り返り" description="一週間の日報がそろうと、ここに振り返りが表示されます。" icon={CalendarRange} />
        <Card className="py-10 text-center"><CardContent className="text-sm text-muted-foreground">まだ週次データがありません。</CardContent></Card>
      </div>
    )
  }

  const generate = async () => {
    setGenerating(true)
    try {
      await fetch("/api/review/generate?period=week", { method: "POST" })
      toast.success("一週間の記録から振り返りを整えました。")
    } catch {
      toast.success("デモデータから振り返りを整えました。")
    } finally {
      setGenerating(false)
    }
  }

  const saveDraft = () => {
    savePraisePost(praise.id, praiseText.trim(), "private")
    toast.success("自分だけの記録として保存しました。")
  }

  const publish = () => {
    savePraisePost(praise.id, praiseText.trim(), "published")
    toast.success("今週の自分褒めを投稿しました。デモではこのブラウザ内だけに保存されます。")
  }

  return (
    <div>
      <ScreenHeading
        eyebrow={`${dateLabel(weekly.weekStart)} — ${dateLabel(weekly.weekEnd)}`}
        title="週の振り返り"
        description="AIに褒められるだけでなく、週初めの自分の言葉から、今週できたことを見つけます。"
        icon={CalendarRange}
        action={
          <Button variant="outline" size="sm" onClick={generate} disabled={generating}>
            {generating ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
            <span className="hidden sm:inline">再生成</span>
          </Button>
        }
      />

      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <Card className="py-3"><CardContent className="px-2 text-center"><CheckCircle2 className="mx-auto size-4 text-primary" /><p className="mt-1 text-xl font-semibold">{weekly.completedTaskCount}</p><p className="text-[0.58rem] text-muted-foreground">完了タスク</p></CardContent></Card>
          <Card className="py-3"><CardContent className="px-2 text-center"><Clock3 className="mx-auto size-4 text-primary" /><p className="mt-1 text-xl font-semibold">{weekly.actualMinutes}</p><p className="text-[0.58rem] text-muted-foreground">実績・分</p></CardContent></Card>
          <Card className="py-3"><CardContent className="px-2 text-center"><TrendingUp className="mx-auto size-4 text-primary" /><p className="mt-1 text-xl font-semibold">{Math.round(weekly.completionRate * 100)}%</p><p className="text-[0.58rem] text-muted-foreground">完了率</p></CardContent></Card>
        </div>

        <Card className="border-primary/15 bg-secondary/35 py-5">
          <CardContent className="px-5">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" aria-hidden="true" />
              <p className="eyebrow">WEEKLY SUMMARY</p>
            </div>
            <p className="mt-3 text-sm font-medium leading-relaxed">{weekly.summary}</p>
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-[0.6rem] text-muted-foreground">
                <span>見積 {weekly.plannedMinutes}分</span>
                <span>実績 {weekly.actualMinutes}分</span>
              </div>
              <Progress value={Math.min(100, (weekly.actualMinutes / Math.max(1, weekly.plannedMinutes)) * 100)} className="gap-0" />
            </div>
          </CardContent>
        </Card>

        <Card className="py-4">
          <CardHeader className="px-4 sm:px-5">
            <CardTitle className="flex items-center gap-2 text-xs"><CalendarRange className="size-4 text-primary" />一週間の積み重ね</CardTitle>
          </CardHeader>
          <CardContent className="px-4 sm:px-5">
            <div className="grid grid-cols-7 gap-1.5">
              {daily.map((review) => {
                const actual = review.scheduleComparison.reduce((sum, item) => sum + item.actualMinutes, 0)
                return (
                  <div key={review.id} className="rounded-lg border bg-background/60 px-1 py-2 text-center">
                    <p className="text-[0.55rem] text-muted-foreground">{dateLabel(review.date)}</p>
                    <div className="mx-auto my-2 flex h-16 w-2 items-end overflow-hidden rounded-full bg-muted">
                      <div className="w-full rounded-full bg-primary" style={{ height: `${Math.min(100, Math.max(12, actual))}%` }} />
                    </div>
                    <p className="font-mono text-[0.52rem] text-muted-foreground">{actual}分</p>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="py-4">
            <CardHeader className="px-4"><CardTitle className="flex items-center gap-2 text-xs"><Heart className="size-4 text-primary" />今週できたこと</CardTitle></CardHeader>
            <CardContent className="space-y-2 px-4">
              {weekly.highlights.map((item) => <div key={item} className="flex gap-2 text-[0.68rem] leading-relaxed"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-primary" />{item}</div>)}
            </CardContent>
          </Card>
          <Card className="py-4">
            <CardHeader className="px-4"><CardTitle className="flex items-center gap-2 text-xs"><Target className="size-4 text-primary" />次週の焦点</CardTitle></CardHeader>
            <CardContent className="px-4"><p className="text-[0.7rem] leading-relaxed">{weekly.nextWeekFocus}</p></CardContent>
          </Card>
        </div>

        {praise.evidence.map((evidence) => (
          <Card key={`${evidence.sourceDailyReviewId}-${evidence.kind}`} className="overflow-visible border-primary/15 py-4">
            <CardContent className="px-5">
              <div className="flex items-center gap-2">
                <Quote className="size-4 text-primary" aria-hidden="true" />
                <p className="eyebrow">過去の自分から届いた言葉</p>
                <Badge variant="secondary" className="ml-auto">{dateLabel(evidence.sourceDate)}</Badge>
              </div>
              <blockquote className="mt-3 border-l-2 border-primary/30 pl-4 text-sm font-medium leading-relaxed">
                「{evidence.quote}」
              </blockquote>
              <p className="mt-3 text-[0.68rem] leading-relaxed text-muted-foreground">
                そして今週、{evidence.fact}。週初めの自分との約束を、行動で残しています。
              </p>
            </CardContent>
          </Card>
        ))}

        <Card className="border-primary/15 bg-accent/55 py-5">
          <CardHeader className="px-5">
            <div className="flex items-center gap-2">
              <MessageCircleHeart className="size-4 text-primary" aria-hidden="true" />
              <CardTitle className="text-sm">今週の自分褒め</CardTitle>
              <Badge variant={praise.status === "published" ? "default" : "outline"} className="ml-auto">
                {praise.status === "published" ? "投稿済み" : praise.status === "private" ? "自分だけ" : "下書き"}
              </Badge>
            </div>
            <p className="text-[0.62rem] text-muted-foreground">仕事の固有名詞を外してから保存・投稿できます。</p>
          </CardHeader>
          <CardContent className="px-5">
            <Textarea value={praiseText} onChange={(event) => setPraiseText(event.target.value)} className="min-h-36 bg-background/80 text-xs leading-loose" />
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" size="sm" onClick={saveDraft}>自分だけに保存</Button>
              <Button size="sm" onClick={publish} className="sm:ml-auto"><Send />みんなに投稿</Button>
            </div>
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-background/55 p-2.5 text-[0.58rem] leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
              デモ投稿はこのブラウザ内だけに保存されます。日報・タスク・メール本文は共有対象に含めません。
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
