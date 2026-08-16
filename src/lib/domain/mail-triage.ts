export interface DeterministicMailTriageInput {
  readonly subject: string
  readonly bodyText: string
}

export interface DeterministicMailTriageResult {
  readonly category: "reply_required" | "action_required" | "information"
  readonly priority: "urgent" | "today" | "anytime"
  readonly taskType: "sukima" | "jikkuri"
  readonly reason: string
  readonly taskTitle: string
}

function taskTitle(subject: string, category: DeterministicMailTriageResult["category"]) {
  const title = subject.replace(/^(re|fwd):\s*/i, "").trim() || "メール"
  if (category === "reply_required") return `${title}に返信する`.slice(0, 120)
  if (category === "action_required") return `${title}を対応する`.slice(0, 120)
  return `${title}を確認する`.slice(0, 120)
}

export function classifyMailDeterministically(
  input: DeterministicMailTriageInput,
): DeterministicMailTriageResult {
  const text = `${input.subject}\n${input.bodyText}`.replace(/\s+/g, " ")
  const noReplyRequested = /(返信不要|ご返信には及びません|ご返信は不要|回答不要|返答不要|do not reply|no reply (?:is )?(?:needed|required)|no response (?:is )?(?:needed|required))/i.test(text)
  const explicitReplyRequest = /(ご返信(?:ください|をお願いします|お願いします|願います|いただけます|いただける)|返信(?:ください|をお願いします|願います|いただけます|いただける)|ご回答(?:ください|をお願いします|お願いします|願います|いただけます|いただける)|回答(?:ください|をお願いします|願います|いただけます|いただける)|お返事(?:ください|をお願いします|お願いします|いただけます|いただける)|(?:可否|出欠)(?:を)?(?:ご返信|ご回答|お知らせ|ご連絡)|please\s+(?:reply|respond)|reply\s+(?:requested|required)|response\s+(?:requested|required)|(?:could|would)\s+you\s+(?:reply|respond))/i.test(text)
  const schedulingReplyRequest = /(日程|日時|候補日|候補日時|ご都合|参加|出欠|可否)[\s\S]{0,100}(いかがでしょうか|お知らせください|ご連絡ください|ご返信ください|ご回答ください|選んでください|お選びください|let me know|rsvp)/i.test(text)
  const replyRequired = !noReplyRequested && (explicitReplyRequest || schedulingReplyRequest)
  const actionRequired = /((?:ご)?確認(?:ください|をお願いします)|(?:ご)?対応(?:ください|してください|をお願いします)|(?:ご)?提出(?:ください|してください|をお願いします)|(?:ご)?送付(?:ください|してください|をお願いします)|(?:ご)?更新(?:ください|してください|をお願いします)|(?:ご)?作成(?:ください|してください|をお願いします)|期限|締切|please\s+(?:review|submit|update|send|complete))/i.test(text)
  const urgent = /(至急|緊急|本日中|今日中|期限.*本日|締切.*本日|asap|urgent|by today)/i.test(text)
  const longTask = /(作成|更新|調査|資料|実装|レビュー|review|document|proposal|report)/i.test(text)
  const category = replyRequired
    ? "reply_required"
    : actionRequired
      ? "action_required"
      : "information"
  return {
    category,
    priority: urgent ? "urgent" : category === "information" ? "anytime" : "today",
    taskType: longTask ? "jikkuri" : "sukima",
    reason: category === "reply_required"
      ? "明示的な返信または回答の依頼があります。"
      : category === "action_required"
        ? "返信ではなく具体的な確認または作業が求められています。"
        : "明示的な返信依頼はありません。",
    taskTitle: taskTitle(input.subject, category),
  }
}
