import type { Metadata } from "next"

import { ActivityScreen } from "@/components/screens/activity-screen"

export const metadata: Metadata = {
  title: "処理履歴",
}

export default function Page() {
  return <ActivityScreen />
}
