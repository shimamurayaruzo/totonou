import { describe, expect, it } from "vitest"

import { classifyMailDeterministically } from "./mail-triage"

describe("conservative deterministic mail triage", () => {
  it("requires an explicit reply request", () => {
    expect(classifyMailDeterministically({
      subject: "日程候補について",
      bodyText: "火曜と水曜のどちらがよいか、ご返信ください。",
    }).category).toBe("reply_required")
    expect(classifyMailDeterministically({
      subject: "出欠確認",
      bodyText: "参加可否をお知らせください。",
    }).category).toBe("reply_required")
  })

  it("treats confirmation work as action instead of reply", () => {
    expect(classifyMailDeterministically({
      subject: "資料の共有",
      bodyText: "添付資料をご確認ください。",
    }).category).toBe("action_required")
    expect(classifyMailDeterministically({
      subject: "更新のお願い",
      bodyText: "本日中に一覧を更新してください。",
    }).category).toBe("action_required")
  })

  it("does not treat rhetorical questions as reply requests", () => {
    expect(classifyMailDeterministically({
      subject: "新機能のご紹介",
      bodyText: "新しい働き方はいかがでしょうか。詳しくはこちら。",
    }).category).toBe("information")
  })

  it("lets an explicit no-reply statement override other wording", () => {
    expect(classifyMailDeterministically({
      subject: "受付完了",
      bodyText: "内容をご確認ください。ご返信は不要です。",
    }).category).toBe("action_required")
  })

  it("supports explicit English reply requests", () => {
    expect(classifyMailDeterministically({
      subject: "Meeting options",
      bodyText: "Please reply with your preferred date.",
    }).category).toBe("reply_required")
  })
})
