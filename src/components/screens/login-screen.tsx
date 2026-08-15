import Link from "next/link"
import { Database, LockKeyhole, LogIn, PlayCircle } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function LoginScreen() {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-10rem)] max-w-md items-center">
      <Card className="w-full border bg-card/95 shadow-[0_18px_60px_rgb(34_42_38/0.08)]">
        <CardHeader className="items-center px-6 pt-8 text-center">
          <span className="mb-2 grid size-12 place-items-center rounded-2xl bg-secondary text-primary">
            <LockKeyhole className="size-5" aria-hidden="true" />
          </span>
          <CardTitle className="text-xl">自分の一日を、ひとつに</CardTitle>
          <CardDescription className="max-w-sm leading-relaxed">
            Googleアカウントでログインすると、予定とメールを安全に取り込みます。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-6 pb-7">
          <a
            href="/api/auth/login?next=/"
            className={cn(buttonVariants({ size: "lg" }), "h-11 w-full gap-2")}
          >
            <LogIn className="size-4" aria-hidden="true" />
            Googleでログイン
          </a>
          <div className="flex items-center gap-3 text-[0.65rem] text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
            または
          </div>
          <Link
            href="/"
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 w-full gap-2")}
          >
            <PlayCircle className="size-4" aria-hidden="true" />
            デモデータで試す
          </Link>
          <Alert className="bg-muted/55 px-3 py-3">
            <Database className="size-4" aria-hidden="true" />
            <AlertTitle className="text-xs">デモモード</AlertTitle>
            <AlertDescription className="text-[0.68rem] leading-relaxed">
              APIキーなしでも全画面を操作できます。データはこのブラウザ内だけに保存されます。
            </AlertDescription>
          </Alert>
          <p className="text-center text-[0.62rem] leading-relaxed text-muted-foreground">
            送信や予定登録は必ず確認画面を挟み、自動では実行しません。
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
