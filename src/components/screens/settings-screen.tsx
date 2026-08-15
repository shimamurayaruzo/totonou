"use client"

import Link from "next/link"
import { useState } from "react"
import {
  Bot,
  CalendarSync,
  Check,
  Database,
  KeyRound,
  LoaderCircle,
  Mail,
  RotateCcw,
  Save,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRoundCog,
} from "lucide-react"
import { toast } from "sonner"

import { useApp } from "@/components/app-provider"
import { ScreenHeading } from "@/components/screen-heading"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { CoachPersona, FetchRange } from "@/lib/types"
import { cn } from "@/lib/utils"

const fetchOptions: { value: FetchRange; label: string; description: string }[] = [
  { value: "last_5_days", label: "直近5日分", description: "日常利用におすすめ" },
  { value: "latest_100", label: "直近100件", description: "最大100件まで確認" },
]

const personaOptions: { value: CoachPersona; label: string; example: string }[] = [
  { value: "gentle_secretary", label: "優しい秘書", example: "まずは25分、この仕事だけに集中しましょう。" },
  { value: "passionate_coach", label: "熱血コーチ", example: "この25分で一歩進めよう。" },
  { value: "butler", label: "執事風", example: "ただいまより集中のお時間です。" },
]

function SettingCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <Card className="py-4">
      <CardHeader className="px-4 sm:px-5">
        <CardTitle className="text-xs">{title}</CardTitle>
        <p className="text-[0.62rem] leading-relaxed text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="px-4 sm:px-5">{children}</CardContent>
    </Card>
  )
}

function IntegrationRow({
  icon: Icon,
  title,
  description,
  status,
  action,
}: {
  icon: typeof Mail
  title: string
  description: string
  status: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium">{title}</p>
          <Badge variant="outline" className="text-[0.56rem]">{status}</Badge>
        </div>
        <p className="mt-0.5 text-[0.62rem] leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  )
}

export function SettingsScreen() {
  const { state, saveSettings, resetDemo } = useApp()
  const [fetchRange, setFetchRange] = useState(state.settings.fetchRange)
  const [coachPersona, setCoachPersona] = useState(state.settings.coachPersona)
  const [markAsRead, setMarkAsRead] = useState(state.settings.markAsRead)
  const [dreams, setDreams] = useState(state.settings.dreams.join("\n"))
  const [monthlyGoals, setMonthlyGoals] = useState(state.settings.monthlyGoals.join("\n"))
  const [allowlist, setAllowlist] = useState(state.settings.domainAllowlist.join("\n"))
  const [blocklist, setBlocklist] = useState(state.settings.domainBlocklist.join("\n"))
  const [learningStyle, setLearningStyle] = useState(false)

  const save = () => {
    const lines = (value: string) => value.split("\n").map((line) => line.trim()).filter(Boolean)
    saveSettings({
      fetchRange,
      coachPersona,
      markAsRead,
      dreams: lines(dreams),
      monthlyGoals: lines(monthlyGoals),
      domainAllowlist: lines(allowlist),
      domainBlocklist: lines(blocklist),
    })
    toast.success("設定を保存しました。")
  }

  const reset = () => {
    if (!window.confirm("ブラウザ内のデモデータを初期状態に戻しますか？")) return
    resetDemo()
    toast.success("デモデータを初期状態に戻しました。")
  }

  const learnStyle = async () => {
    setLearningStyle(true)
    try {
      const response = await fetch("/api/style/learn", { method: "POST" })
      if (!response.ok) throw new Error("style learning failed")
      toast.success("送信済みメールから返信文体を更新しました。")
    } catch {
      toast.success("デモの返信文体プロフィールを更新しました。")
    } finally {
      setLearningStyle(false)
    }
  }

  return (
    <div>
      <ScreenHeading
        eyebrow="PREFERENCES"
        title="設定"
        description="メールの確認範囲と、Totonouからの声かけを調整します。"
        icon={Settings}
      />

      <div className="space-y-4">
        <SettingCard title="メールの取得範囲" description="一度の取り込みは、どちらを選んでも最大100件です。">
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="メール取得範囲">
            {fetchOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={fetchRange === option.value}
                onClick={() => setFetchRange(option.value)}
                className={cn(
                  "rounded-xl border px-3 py-3 text-left transition-colors hover:bg-muted",
                  fetchRange === option.value && "border-primary/35 bg-secondary/55",
                )}
              >
                <span className="flex items-center gap-2 text-xs font-medium">
                  <span className={cn("grid size-4 place-items-center rounded-full border", fetchRange === option.value && "border-primary bg-primary text-primary-foreground")}>
                    {fetchRange === option.value ? <Check className="size-2.5" /> : null}
                  </span>
                  {option.label}
                </span>
                <span className="mt-1 block pl-6 text-[0.6rem] text-muted-foreground">{option.description}</span>
              </button>
            ))}
          </div>
        </SettingCard>

        <SettingCard title="声かけの口調" description="作業の区切りだけに、テキストで声をかけます。作業中の割り込みはしません。">
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="声かけの口調">
            {personaOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={coachPersona === option.value}
                onClick={() => setCoachPersona(option.value)}
                className={cn(
                  "rounded-xl border p-3 text-left transition-colors hover:bg-muted",
                  coachPersona === option.value && "border-primary/35 bg-secondary/55",
                )}
              >
                <span className="flex items-center gap-1.5 text-xs font-medium">
                  <Bot className="size-3.5 text-primary" />
                  {option.label}
                </span>
                <span className="mt-2 block text-[0.58rem] leading-relaxed text-muted-foreground">{option.example}</span>
              </button>
            ))}
          </div>
        </SettingCard>

        <SettingCard title="タスク完了時にGmailを既読にする" description="オフにしても、メール側の既読状態は変更されません。">
          <div className="flex items-center justify-between rounded-xl border bg-background/55 px-3 py-3">
            <div className="flex items-center gap-2">
              <Mail className="size-4 text-primary" aria-hidden="true" />
              <span className="text-xs font-medium">{markAsRead ? "オン" : "オフ"}</span>
            </div>
            <Switch checked={markAsRead} onCheckedChange={setMarkAsRead} aria-label="完了時の既読化" />
          </div>
        </SettingCard>

        <SettingCard title="夢・希望" description="AIアドバイスが、目先の効率だけでなく長期の方向を見失わないための文脈です。">
          <Textarea value={dreams} onChange={(event) => setDreams(event.target.value)} className="min-h-24 bg-background/60 text-xs leading-relaxed" placeholder="一行に一つ入力" />
        </SettingCard>

        <SettingCard title="今月やりたいこと" description="朝の目標と夜の改善提案に使います。">
          <Textarea value={monthlyGoals} onChange={(event) => setMonthlyGoals(event.target.value)} className="min-h-24 bg-background/60 text-xs leading-relaxed" placeholder="一行に一つ入力" />
        </SettingCard>

        <SettingCard title="サービス連携" description="キーとトークンはサーバー環境変数だけで管理し、ブラウザやログには出しません。">
          <div className="divide-y">
            <IntegrationRow
              icon={Mail}
              title="Gmail"
              description="未読メールの取得、承認後の返信、タスク完了時の既読化。"
              status="OAuth"
              action={<Link href="/login" className={buttonVariants({ variant: "outline", size: "xs" })}>接続</Link>}
            />
            <IntegrationRow icon={CalendarSync} title="Google Calendar" description="今日の予定取得、候補日時の競合確認、確認後の予定登録。" status="OAuth" />
            <IntegrationRow icon={Database} title="Supabase" description="タスク、メール、日報、ログをユーザーごとに保存。" status="任意" />
            <IntegrationRow icon={Sparkles} title="Claude" description="トリアージ、返信案、日報、声かけテキストを生成。" status="任意" />
            <IntegrationRow icon={KeyRound} title="Xserverメール" description="IMAP/SMTPアダプターを環境変数で有効化。" status="任意" />
          </div>
        </SettingCard>

        <SettingCard title="返信文体の学習" description="送信済みメールの挨拶・文末・長さだけを分析し、本文や宛先は保存しません。">
          <Button variant="outline" onClick={learnStyle} disabled={learningStyle}>
            {learningStyle ? <LoaderCircle className="animate-spin" /> : <UserRoundCog />}
            返信文体を更新
          </Button>
        </SettingCard>

        <details className="paper-card group px-4 py-4 sm:px-5">
          <summary className="cursor-pointer list-none text-xs font-medium">詳細なメール除外設定</summary>
          <div className="mt-4 grid gap-4 border-t pt-4 sm:grid-cols-2">
            <label className="space-y-2 text-[0.65rem] text-muted-foreground">
              優先するドメイン
              <Textarea value={allowlist} onChange={(event) => setAllowlist(event.target.value)} className="min-h-24 bg-background text-xs text-foreground" placeholder="example.com" />
            </label>
            <label className="space-y-2 text-[0.65rem] text-muted-foreground">
              除外するドメイン
              <Textarea value={blocklist} onChange={(event) => setBlocklist(event.target.value)} className="min-h-24 bg-background text-xs text-foreground" placeholder="example.com" />
            </label>
          </div>
        </details>

        <Card className="border-primary/10 bg-secondary/35 py-4">
          <CardContent className="flex items-start gap-3 px-4 sm:px-5">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <p className="text-xs font-medium">プライバシー設計</p>
              <p className="mt-1 text-[0.62rem] leading-relaxed text-muted-foreground">
                メール本文・氏名・アドレス・秘密情報をactivity_logsへ記録しません。返信送信と予定登録は、必ず人の確認を挟みます。
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row">
          <Button variant="outline" size="sm" onClick={reset}>
            <RotateCcw />
            デモデータを初期状態に戻す
          </Button>
          <Button size="sm" onClick={save} className="sm:ml-auto">
            <Save />
            設定を保存
          </Button>
        </div>
      </div>
    </div>
  )
}
