import type { Metadata } from "next"

import { ReviewScreen } from "@/components/screens/review-screen"

export const metadata: Metadata = {
  title: "夜の振り返り",
}

export default function Page() {
  return <ReviewScreen />
}
