"use client"

import { ThemeProvider } from "next-themes"

import { AppProvider } from "@/components/app-provider"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <TooltipProvider delay={350}>
        <AppProvider>{children}</AppProvider>
        <Toaster position="bottom-center" richColors closeButton />
      </TooltipProvider>
    </ThemeProvider>
  )
}
