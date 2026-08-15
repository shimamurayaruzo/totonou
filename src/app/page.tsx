import type { Metadata } from "next"

import { BriefingScreen } from "@/components/screens/briefing-screen"

export const metadata: Metadata = {
  title: "朝のブリーフィング",
}

export default function Page() {
  return <BriefingScreen />
}
