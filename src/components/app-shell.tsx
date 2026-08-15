"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { CalendarRange, History, MoonStar, Settings, SunMedium } from "lucide-react"

import { cn } from "@/lib/utils"

const navItems = [
  { href: "/", label: "朝のブリーフィング", shortLabel: "朝", icon: SunMedium },
  { href: "/review", label: "夜の振り返り", shortLabel: "夜", icon: MoonStar },
  { href: "/activity", label: "処理履歴", shortLabel: "履歴", icon: History },
  { href: "/weekly", label: "週の振り返り", shortLabel: "週", icon: CalendarRange },
  { href: "/settings", label: "設定", shortLabel: "設定", icon: Settings },
]

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href)
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="min-h-dvh pb-20 md:pb-0">
      <a
        href="#main-content"
        className="fixed left-4 top-3 z-[100] -translate-y-20 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground transition-transform focus:translate-y-0"
      >
        本文へ移動
      </a>
      <header className="sticky top-0 z-40 border-b bg-background/92 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[760px] items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="group flex min-w-0 items-baseline gap-2 rounded-md">
            <span className="text-lg font-bold tracking-[-0.04em] text-foreground group-hover:text-primary">
              Totonou
            </span>
            <span className="hidden truncate text-[0.64rem] text-muted-foreground sm:inline">
              メールもタスクも予定も、朝ひらけば、ととのう。
            </span>
          </Link>
          <nav className="ml-auto hidden items-center gap-0.5 md:flex" aria-label="メインナビゲーション">
            {navItems.map(({ href, label, shortLabel, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-label={label}
                aria-current={isActive(pathname, href) ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[0.7rem] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  isActive(pathname, href) && "bg-secondary text-secondary-foreground",
                )}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {shortLabel}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main id="main-content" className="mx-auto w-full max-w-[540px] px-4 py-7 sm:px-6 sm:py-9">
        {children}
      </main>
      <nav
        className="fixed inset-x-3 bottom-3 z-50 grid grid-cols-5 rounded-2xl border bg-card/95 p-1.5 shadow-[0_10px_35px_rgb(34_42_38/0.16)] backdrop-blur-xl md:hidden"
        aria-label="モバイルナビゲーション"
      >
        {navItems.map(({ href, shortLabel, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(pathname, href) ? "page" : undefined}
            className={cn(
              "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[0.62rem] text-muted-foreground transition-colors",
              isActive(pathname, href) && "bg-secondary text-secondary-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {shortLabel}
          </Link>
        ))}
      </nav>
    </div>
  )
}
