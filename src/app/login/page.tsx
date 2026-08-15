import type { Metadata } from "next"

import { LoginScreen } from "@/components/screens/login-screen"

export const metadata: Metadata = {
  title: "ログイン",
}

export default function Page() {
  return <LoginScreen />
}
