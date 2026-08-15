import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export function ScreenHeading({
  eyebrow,
  title,
  description,
  icon: Icon,
  action,
  className,
}: {
  eyebrow?: string
  title: string
  description: string
  icon?: LucideIcon
  action?: React.ReactNode
  className?: string
}) {
  return (
    <header className={cn("mb-6 flex items-start gap-3", className)}>
      {Icon ? (
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground">
          <Icon className="size-4" aria-hidden="true" />
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        {eyebrow ? <p className="eyebrow mb-1">{eyebrow}</p> : null}
        <h1 className="text-xl font-semibold tracking-[-0.035em] sm:text-2xl">{title}</h1>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
          {description}
        </p>
      </div>
      {action}
    </header>
  )
}
