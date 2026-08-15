import type { Metadata, Viewport } from "next"
import "./globals.css"

import { AppShell } from "@/components/app-shell"
import { Providers } from "@/components/providers"

export const metadata: Metadata = {
  title: {
    default: "Totonou — 一日を整えるAI秘書",
    template: "%s | Totonou",
  },
  description: "メール・タスク・予定を朝に整え、夜の日報までつなぐAI秘書。",
  applicationName: "Totonou",
}

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6f1" },
    { media: "(prefers-color-scheme: dark)", color: "#171c19" },
  ],
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  )
}
