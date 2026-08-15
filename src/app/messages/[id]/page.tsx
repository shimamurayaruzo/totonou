import type { Metadata } from "next"

import { MessageDetailScreen } from "@/components/screens/message-detail-screen"

export const metadata: Metadata = {
  title: "メール詳細",
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return <MessageDetailScreen messageId={id} />
}
