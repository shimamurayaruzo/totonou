import type { Metadata } from "next"

import { WeeklyScreen } from "@/components/screens/weekly-screen"

export const metadata: Metadata = {
  title: "週の振り返り",
}

export default function Page() {
  return <WeeklyScreen />
}
