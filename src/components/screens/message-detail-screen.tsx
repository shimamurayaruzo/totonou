"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import {
  AlertTriangle,
  ArrowLeft,
  CalendarPlus,
  Check,
  ExternalLink,
  FileQuestion,
  LoaderCircle,
  Mail,
  MessageSquareReply,
  Send,
  Sparkles,
  UserRoundCheck,
} from "lucide-react"
import { toast } from "sonner"

import { useApp } from "@/components/app-provider"
import { ScreenHeading } from "@/components/screen-heading"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function candidate(date: string, hour: number) {
  const startAt = new Date(`${date}T${String(hour).padStart(2, "0")}:00:00+09:00`).toISOString()
  const endAt = new Date(Date.parse(startAt) + 60 * 60_000).toISOString()
  return { startAt, endAt }
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value))
}

const categoryLabels = {
  needs_reply: "要返信",
  needs_action: "要対応",
  information: "情報のみ",
  ignore: "無視",
} as const

export function MessageDetailScreen({ messageId }: { messageId: string }) {
  const { state, scheduleEvent, markMessageRead } = useApp()
  const message = state.messages.find((item) => item.messageId === messageId)
  const [draft, setDraft] = useState("")
  const [generating, setGenerating] = useState(false)
  const [sending, setSending] = useState(false)
  const [selectedCandidate, setSelectedCandidate] = useState(0)
  const [scheduled, setScheduled] = useState(false)
  const [sent, setSent] = useState(false)

  const candidates = useMemo(
    () => [candidate(addDays(state.asOfDate, 1), 10), candidate(addDays(state.asOfDate, 2), 13)],
    [state.asOfDate],
  )

  if (!message) {
    return (
      <div>
        <ScreenHeading title="メール詳細" description="指定されたメールは見つかりませんでした。" icon={FileQuestion} />
        <Card className="py-10 text-center">
          <CardContent>
            <p className="text-sm text-muted-foreground">メールが削除されたか、URLが正しくありません。</p>
            <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "mt-4")}><ArrowLeft />朝へ戻る</Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const triage = message.triageResult
  const requiresSchedule = triage?.reasonCode === "schedule_coordination"
  const selected = candidates[selectedCandidate]
  const conflicts = state.calendarEvents.filter(
    (event) => Date.parse(event.startAt) < Date.parse(selected.endAt) && Date.parse(event.endAt) > Date.parse(selected.startAt),
  )
  const fallbackDraft = `${message.from.name} 様\n\nご連絡ありがとうございます。内容を確認しました。\n${requiresSchedule ? `${dateTime(selected.startAt)}でお願いいたします。` : "ご依頼の内容で進めます。確認事項があれば改めてご連絡します。"}\n\nどうぞよろしくお願いいたします。`

  const generateDraft = async () => {
    setGenerating(true)
    try {
      const response = await fetch("/api/replies/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messageId: message.messageId }),
      })
      if (!response.ok) throw new Error("draft generation failed")
      const data = await response.json() as { draft?: string; text?: string }
      setDraft(data.draft ?? data.text ?? fallbackDraft)
      toast.success("過去の返信文体を参考に、返信案を作りました。")
    } catch {
      setDraft(fallbackDraft)
      toast.success("デモ返信案を作りました。")
    } finally {
      setGenerating(false)
    }
  }

  const sendReply = async () => {
    const body = (draft || fallbackDraft).trim()
    if (!window.confirm("表示中の返信文を承認して送信しますか？送信後は取り消せません。")) return
    setSending(true)
    try {
      const response = await fetch("/api/replies/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messageId: message.messageId,
          threadId: message.threadId,
          body,
          approvedByUser: true,
        }),
      })
      if (!response.ok) throw new Error("reply send failed")
      markMessageRead(message.messageId)
      setSent(true)
      toast.success("承認した返信を送信しました。")
    } catch {
      toast.error("返信を送信できませんでした。送信済みにはしていません。")
    } finally {
      setSending(false)
    }
  }

  const registerSchedule = async () => {
    const localConflictApproved = conflicts.length > 0
    const confirmation = localConflictApproved
      ? "既存予定と重なっています。このまま登録しますか？"
      : `${dateTime(selected.startAt)}で予定を登録しますか？`
    if (!window.confirm(confirmation)) return

    const request = (allowConflicts: boolean) => fetch("/api/calendar/schedule", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messageId: message.messageId,
        title: `打ち合わせ：${message.subject}`,
        startAt: selected.startAt,
        endAt: selected.endAt,
        approvedByUser: true,
        allowConflicts,
      }),
    })

    try {
      let response = await request(localConflictApproved)
      if (response.status === 409) {
        const approved = window.confirm(
          "Google Calendar上の予定と重なっています。それでも登録しますか？",
        )
        if (!approved) return
        response = await request(true)
      }
      if (!response.ok) {
        toast.error("Google Calendarへ予定を登録できませんでした。")
        return
      }
      scheduleEvent({
        title: `打ち合わせ：${message.subject}`,
        description: `メール ${message.messageId} から登録`,
        startAt: selected.startAt,
        endAt: selected.endAt,
      })
      setScheduled(true)
      toast.success("予定をGoogle Calendarへ登録しました。")
    } catch {
      toast.error("Google Calendarへの接続に失敗しました。")
    }
  }

  return (
    <div>
      <ScreenHeading
        eyebrow="MESSAGE DETAIL"
        title="メール詳細"
        description="元メール、AIの判断、次の行動を一か所で確認します。"
        icon={Mail}
        action={<Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}><ArrowLeft />朝へ戻る</Link>}
      />

      <div className="space-y-4">
        <Card className="py-4">
          <CardHeader className="px-4 sm:px-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={message.isUnread ? "default" : "secondary"}>{message.isUnread ? "未読" : "既読"}</Badge>
              <Badge variant="outline">{message.account}</Badge>
              <span className="ml-auto text-[0.62rem] text-muted-foreground">{dateTime(message.receivedAt)}</span>
            </div>
            <CardTitle className="mt-2 text-base sm:text-lg">{message.subject}</CardTitle>
            <p className="text-[0.68rem] text-muted-foreground">{message.from.name} &lt;{message.from.address}&gt;</p>
          </CardHeader>
          <CardContent className="px-4 sm:px-5">
            <div className="rounded-xl border bg-background/60 p-4 text-xs leading-loose whitespace-pre-wrap">
              {message.bodyText}
            </div>
            <a href={message.sourceUrl} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "link", size: "sm" }), "mt-2 px-0")}>
              Gmailで元メールを開く <ExternalLink />
            </a>
          </CardContent>
        </Card>

        {triage ? (
          <Card className="border-primary/15 bg-secondary/30 py-4">
            <CardHeader className="px-4 sm:px-5">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" aria-hidden="true" />
                <CardTitle className="text-xs">AI要約と分類</CardTitle>
                <Badge variant="secondary" className="ml-auto">{categoryLabels[triage.category]}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 px-4 sm:px-5">
              <p className="text-sm font-medium leading-relaxed">{triage.summary}</p>
              <div className="rounded-lg border bg-background/60 p-3">
                <p className="eyebrow">この分類にした理由</p>
                <p className="mt-1 text-[0.68rem] leading-relaxed text-muted-foreground">{triage.reason}</p>
              </div>
              <div className="flex flex-wrap gap-2 text-[0.6rem] text-muted-foreground">
                <span>確信度 {Math.round(triage.confidence * 100)}%</span>
                <span>・</span>
                <span>{triage.priority === "urgent" ? "今すぐ" : triage.priority === "today" ? "今日中" : "いつでも"}</span>
                <span>・</span>
                <span>{triage.taskType === "sukima" ? "すきまタスク" : "じっくりタスク"}</span>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {requiresSchedule ? (
          <Card className="py-4">
            <CardHeader className="px-4 sm:px-5">
              <div className="flex items-center gap-2">
                <CalendarPlus className="size-4 text-primary" aria-hidden="true" />
                <CardTitle className="text-xs">日程候補をカレンダーへ</CardTitle>
                {scheduled ? <Badge className="ml-auto"><Check />登録済み</Badge> : null}
              </div>
              <p className="text-[0.62rem] text-muted-foreground">メールから候補を検出しました。選択してから登録します。</p>
            </CardHeader>
            <CardContent className="space-y-3 px-4 sm:px-5">
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="日程候補">
                {candidates.map((item, index) => (
                  <button
                    key={item.startAt}
                    type="button"
                    role="radio"
                    aria-checked={selectedCandidate === index}
                    onClick={() => setSelectedCandidate(index)}
                    className={cn("rounded-xl border p-3 text-left text-xs transition-colors hover:bg-muted", selectedCandidate === index && "border-primary/35 bg-secondary/50")}
                  >
                    <span className="font-medium">{dateTime(item.startAt)}</span>
                    <span className="mt-1 block text-[0.6rem] text-muted-foreground">60分</span>
                  </button>
                ))}
              </div>
              {conflicts.length ? (
                <Alert className="border-warning/30 bg-warning/5">
                  <AlertTriangle className="text-warning" />
                  <AlertTitle className="text-xs">既存予定と重なっています</AlertTitle>
                  <AlertDescription className="text-[0.62rem]">{conflicts.map((event) => event.title).join("、")}</AlertDescription>
                </Alert>
              ) : null}
              <Button onClick={registerSchedule} disabled={scheduled}>
                <CalendarPlus />{scheduled ? "登録しました" : "確認してカレンダーに登録"}
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <Card className="py-4">
          <CardHeader className="px-4 sm:px-5">
            <div className="flex items-center gap-2">
              <MessageSquareReply className="size-4 text-primary" aria-hidden="true" />
              <CardTitle className="text-xs">返信ドラフト</CardTitle>
              <Badge variant="outline" className="ml-auto"><UserRoundCheck />文体プロフィール適用</Badge>
            </div>
            <p className="text-[0.62rem] text-muted-foreground">AI案はそのまま送信されません。編集後に承認してください。</p>
          </CardHeader>
          <CardContent className="px-4 sm:px-5">
            {!draft ? (
              <Button variant="outline" onClick={generateDraft} disabled={generating} className="w-full">
                {generating ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
                返信案を生成
              </Button>
            ) : (
              <>
                <Textarea value={draft} onChange={(event) => setDraft(event.target.value)} className="min-h-52 bg-background/65 text-xs leading-loose" />
                {message.account === "goodsystem" ? (
                  <Alert className="mt-3">
                    <AlertTriangle />
                    <AlertTitle className="text-xs">送信名義を確認してください</AlertTitle>
                    <AlertDescription className="text-[0.62rem]">現在はGmail名義で返信します。Xserver直結を有効にするとgoodsystem名義を選べます。</AlertDescription>
                  </Alert>
                ) : null}
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-[0.58rem] leading-relaxed text-muted-foreground">threadIdだけで元スレッドへ返信します。</p>
                  <Button onClick={sendReply} disabled={sending || sent}>
                    {sending ? <LoaderCircle className="animate-spin" /> : sent ? <Check /> : <Send />}
                    {sent ? "送信済み" : "承認して送信"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
