import { describe, expect, it } from "vitest";

import type { Message } from "../types";
import {
  buildTriageClassificationLog,
  deduplicateMessages,
  htmlToTriageText,
  isAutomatedSender,
  isPiiSafeTriageLogContext,
  parseTriageBatch,
  parseTriageDecision,
  prepareMessageTextForTriage,
  preprocessMessagesForTriage,
  triageDecisionSchema,
} from "./triage";

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    messageId: "message-1",
    userId: "user-1",
    threadId: "thread-1",
    channel: "gmail",
    account: "gmail",
    from: { name: "架空窓口", address: "person@sender.example" },
    to: [{ name: "デモ利用者", address: "demo@recipient.example" }],
    subject: "確認のお願い",
    bodyText: "内容をご確認ください。",
    bodyHtml: null,
    receivedAt: "2026-08-15T00:00:00.000Z",
    category: "primary",
    labels: ["UNREAD"],
    isUnread: true,
    sourceUrl: "https://mail.google.com/mail/u/0/#inbox/message-1",
    triageResult: null,
    ...overrides,
  };
}

function validDecision() {
  return {
    messageId: "message-1",
    category: "needs_reply" as const,
    priority: "urgent" as const,
    taskType: "sukima" as const,
    summary: "候補日への返信",
    reason: "回答が求められているため",
    reasonCode: "direct_question" as const,
    confidence: 0.98,
  };
}

describe("mechanical triage preprocessing", () => {
  it("prioritizes forums, filters categories and senders, and applies domain rules", () => {
    const messages = [
      makeMessage({
        messageId: "normal",
        receivedAt: "2026-08-15T03:00:00.000Z",
      }),
      makeMessage({
        messageId: "promo",
        category: "promotions",
        from: { name: "販促", address: "offers@market.example" },
      }),
      makeMessage({
        messageId: "social",
        category: "social",
        from: { name: "通知", address: "alert@social.example" },
      }),
      makeMessage({
        messageId: "automated",
        from: { name: "自動", address: "no-reply@robot.example" },
      }),
      makeMessage({
        messageId: "allowed-automated",
        from: { name: "許可済み", address: "info@trusted.example" },
      }),
      makeMessage({
        messageId: "forum-automated",
        category: "forums",
        from: { name: "コミュニティ", address: "no-reply@forum.example" },
        receivedAt: "2026-08-14T00:00:00.000Z",
      }),
      makeMessage({
        messageId: "blocked-forum",
        category: "forums",
        from: { name: "拒否", address: "person@sub.blocked.example" },
      }),
    ];
    const result = preprocessMessagesForTriage(messages, {
      domainAllowlist: ["trusted.example"],
      domainBlocklist: ["blocked.example"],
    });

    expect(result.eligible.map((message) => message.messageId)).toEqual([
      "forum-automated",
      "normal",
      "allowed-automated",
    ]);
    expect(result.excluded).toEqual(
      expect.arrayContaining([
        { messageId: "promo", rule: "promotions_social" },
        { messageId: "social", rule: "promotions_social" },
        { messageId: "automated", rule: "automated_sender" },
        { messageId: "blocked-forum", rule: "blocked_domain" },
      ]),
    );
    const serializedLogs = JSON.stringify(result.auditEvents);
    expect(serializedLogs).not.toContain("確認のお願い");
    expect(serializedLogs).not.toContain("no-reply@robot.example");
    expect(result.auditEvents.every((event) => isPiiSafeTriageLogContext(event.context))).toBe(
      true,
    );
  });

  it("deduplicates by messageId, promotes a forums copy, and never considers over 100", () => {
    const messages = Array.from({ length: 101 }, (_, index) =>
      makeMessage({
        messageId: `message-${index}`,
        receivedAt: new Date(
          Date.parse("2026-08-15T00:00:00.000Z") + index * 1_000,
        ).toISOString(),
      }),
    );
    messages.push(
      makeMessage({
        messageId: "message-0",
        category: "forums",
        receivedAt: "2026-08-13T00:00:00.000Z",
      }),
    );

    const deduplicated = deduplicateMessages(messages);
    expect(deduplicated.unique).toHaveLength(101);
    expect(deduplicated.unique[0].category).toBe("forums");
    expect(deduplicated.duplicates).toEqual([
      { messageId: "message-0", rule: "duplicate_message_id" },
    ]);

    const result = preprocessMessagesForTriage(messages, { maxMessages: 999 });
    expect(result.receivedCount).toBe(102);
    expect(result.uniqueCount).toBe(101);
    expect(result.consideredCount).toBe(100);
    expect(result.eligible).toHaveLength(100);
    expect(result.excluded.filter((item) => item.rule === "maximum_100")).toHaveLength(
      1,
    );
  });

  it("recognizes only the intended automated local-part prefixes", () => {
    expect(isAutomatedSender("no-reply@example.test")).toBe(true);
    expect(isAutomatedSender("noreply+system@example.test")).toBe(true);
    expect(isAutomatedSender("news@example.test")).toBe(true);
    expect(isAutomatedSender("info@example.test")).toBe(true);
    expect(isAutomatedSender("information@example.test")).toBe(false);
    expect(isAutomatedSender("person@example.test")).toBe(false);
  });
});

describe("HTML preprocessing", () => {
  it("removes comments and executable content, decodes text, and retains safe hrefs", () => {
    const html = `<!doctype html><html><head><style>.secret{display:none}</style></head><body><!-- private-comment --><h1>確認&nbsp;事項</h1><p>本文 &amp; 続き</p><script>stealToken()</script><a href="https://portal.example/path?id=1">詳細</a><a href="javascript:alert(1)">危険</a></body></html>`;
    const result = htmlToTriageText(html);

    expect(result).toContain("確認 事項");
    expect(result).toContain("本文 & 続き");
    expect(result).toContain("https://portal.example/path?id=1");
    expect(result).not.toContain("private-comment");
    expect(result).not.toContain("stealToken");
    expect(result).not.toContain("javascript:alert");
    expect(result).not.toContain("<h1>");
  });

  it("enforces the text limit for HTML and plain text", () => {
    expect(htmlToTriageText("<p>abcdefghij</p>", 5)).toBe("abcde");
    expect(
      prepareMessageTextForTriage(
        { bodyHtml: null, bodyText: "  abc   def  " },
        7,
      ),
    ).toBe("abc def");
    expect(htmlToTriageText("<p>text</p>", 0)).toBe("");
  });
});

describe("Zod triage schema", () => {
  it("accepts coherent actionable output and rejects inconsistent fields", () => {
    expect(parseTriageDecision(validDecision())).toEqual(validDecision());

    expect(
      triageDecisionSchema.safeParse({
        ...validDecision(),
        priority: null,
      }).success,
    ).toBe(false);
    expect(
      triageDecisionSchema.safeParse({
        ...validDecision(),
        category: "information",
      }).success,
    ).toBe(false);
    expect(
      triageDecisionSchema.safeParse({
        ...validDecision(),
        extra: "unexpected",
      }).success,
    ).toBe(false);
  });

  it("rejects batches larger than the import limit", () => {
    expect(() =>
      parseTriageBatch(
        Array.from({ length: 101 }, (_, index) => ({
          ...validDecision(),
          messageId: `message-${index}`,
        })),
      ),
    ).toThrow();
  });

  it("builds classification logs without free-form PII fields", () => {
    const decision = {
      ...validDecision(),
      summary: "山田さんへ secret@example.test の件を返信",
      reason: "本文に個人情報が含まれている可能性",
    };
    const log = buildTriageClassificationLog(decision);
    const serialized = JSON.stringify(log);

    expect(serialized).not.toContain(decision.summary);
    expect(serialized).not.toContain(decision.reason);
    expect(serialized).not.toContain("secret@example.test");
    expect(isPiiSafeTriageLogContext(log.context)).toBe(true);
    expect(
      isPiiSafeTriageLogContext({ nested: { body_text: "秘密の本文" } }),
    ).toBe(false);
    expect(
      isPiiSafeTriageLogContext({ value: "secret@example.test" }),
    ).toBe(false);
  });
});
