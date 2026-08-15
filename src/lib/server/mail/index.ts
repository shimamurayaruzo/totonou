import "server-only";

import { serverEnv } from "@/lib/server/env";
import { getGoogleAccessToken } from "@/lib/server/google-auth";
import type {
  FetchMessagesOptions,
  MailMessage,
  MailMessageSummary,
  SendReplyInput,
  SendReplyResult,
} from "@/lib/server/models";
import type { MailChannel } from "@/lib/server/mail/channel";
import { GmailRestChannel } from "@/lib/server/mail/gmail";
import { XserverMailChannel } from "@/lib/server/mail/xserver";

export type { MailChannel } from "@/lib/server/mail/channel";
export { GmailRestChannel } from "@/lib/server/mail/gmail";
export { XserverMailChannel } from "@/lib/server/mail/xserver";

function daysAgo(days: number, hour: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
}

const demoMailMessages: MailMessage[] = [
  {
    externalId: "demo-gmail-1",
    threadId: "demo-thread-1",
    channel: "gmail",
    account: "gmail",
    from: { name: "デモ取引先", address: "partner@example.com" },
    to: [{ address: "demo@example.com" }],
    subject: "打ち合わせ日程の確認",
    snippet: "次回の打ち合わせ日程をご確認ください。",
    bodyText:
      "次回の打ち合わせについて、明日の14時から15時でいかがでしょうか。ご確認をお願いします。",
    receivedAt: daysAgo(0, 0),
    labels: ["UNREAD", "CATEGORY_FORUMS"],
    isRead: false,
    providerUrl: "https://mail.google.com/mail/u/0/#inbox/demo-gmail-1",
  },
  {
    externalId: "demo-gmail-2",
    threadId: "demo-thread-2",
    channel: "gmail",
    account: "gmail",
    from: { name: "デモ担当者", address: "staff@example.net" },
    to: [{ address: "demo@example.com" }],
    subject: "資料確認のお願い",
    snippet: "添付した資料を今日中にご確認ください。",
    bodyText: "添付した資料を今日中にご確認いただけますでしょうか。",
    receivedAt: daysAgo(1, 3),
    labels: ["UNREAD", "CATEGORY_UPDATES"],
    isRead: false,
    providerUrl: "https://mail.google.com/mail/u/0/#inbox/demo-gmail-2",
  },
  {
    externalId: "demo-gmail-promotion",
    threadId: "demo-thread-3",
    channel: "gmail",
    account: "gmail",
    from: { address: "news@example.org" },
    to: [{ address: "demo@example.com" }],
    subject: "キャンペーンのお知らせ",
    snippet: "今週のキャンペーン情報です。",
    bodyText: "キャンペーン情報をご案内します。",
    receivedAt: daysAgo(2, 1),
    labels: ["UNREAD", "CATEGORY_PROMOTIONS"],
    isRead: false,
  },
];

export class DemoMailChannel implements MailChannel {
  async fetchMessages(
    options: FetchMessagesOptions = {},
  ): Promise<MailMessageSummary[]> {
    const limit = Math.min(100, Math.max(1, options.limit ?? 100));
    return demoMailMessages
      .filter(
        (message) =>
          options.unreadOnly === false || message.isRead === false,
      )
      .filter(
        (message) =>
          !options.since || Date.parse(message.receivedAt) >= options.since.getTime(),
      )
      .slice(0, limit)
      .map((message): MailMessageSummary => ({
        externalId: message.externalId,
        threadId: message.threadId,
        channel: message.channel,
        account: message.account,
        from: message.from,
        to: message.to,
        subject: message.subject,
        snippet: message.snippet,
        receivedAt: message.receivedAt,
        labels: message.labels,
        isRead: message.isRead,
      }));
  }

  async readMessage(messageId: string): Promise<MailMessage> {
    const message = demoMailMessages.find(
      (item) => item.externalId === messageId,
    );
    if (!message) {
      throw new Error("Demo message not found");
    }
    return { ...message };
  }

  async sendReply(input: SendReplyInput): Promise<SendReplyResult> {
    return {
      externalId: `demo-sent-${input.messageId}`,
      threadId: input.threadId,
    };
  }

  async markAsRead(messageId: string): Promise<void> {
    const message = demoMailMessages.find(
      (item) => item.externalId === messageId,
    );
    if (message) {
      message.isRead = true;
      message.labels = message.labels.filter((label) => label !== "UNREAD");
    }
  }
}

export type MailChannelResult = {
  channel: MailChannel;
  demo: boolean;
};

export async function createMailChannel(
  name: "gmail" | "xserver",
  providerAccessToken?: string,
): Promise<MailChannelResult> {
  if (name === "gmail") {
    const token = await getGoogleAccessToken(providerAccessToken);
    return token
      ? { channel: new GmailRestChannel(token), demo: false }
      : { channel: new DemoMailChannel(), demo: true };
  }

  if (
    serverEnv.XSERVER_IMAP_HOST &&
    serverEnv.XSERVER_SMTP_HOST &&
    serverEnv.XSERVER_MAIL_USER &&
    serverEnv.XSERVER_MAIL_PASSWORD
  ) {
    return {
      channel: new XserverMailChannel({
        imapHost: serverEnv.XSERVER_IMAP_HOST,
        imapPort: serverEnv.XSERVER_IMAP_PORT,
        imapSecure: serverEnv.XSERVER_IMAP_SECURE,
        smtpHost: serverEnv.XSERVER_SMTP_HOST,
        smtpPort: serverEnv.XSERVER_SMTP_PORT,
        smtpSecure: serverEnv.XSERVER_SMTP_SECURE,
        user: serverEnv.XSERVER_MAIL_USER,
        password: serverEnv.XSERVER_MAIL_PASSWORD,
        from: serverEnv.XSERVER_MAIL_FROM ?? serverEnv.XSERVER_MAIL_USER,
      }),
      demo: false,
    };
  }

  return { channel: new DemoMailChannel(), demo: true };
}
