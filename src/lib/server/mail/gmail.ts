import "server-only";

import { convert } from "html-to-text";
import { z } from "zod";

import { ApiError, clampLimit, ExternalServiceError } from "@/lib/server/http";
import type {
  FetchMessagesOptions,
  MailAccount,
  MailAddress,
  MailMessage,
  MailMessageSummary,
  SendReplyInput,
  SendReplyResult,
} from "@/lib/server/models";
import type { MailChannel } from "@/lib/server/mail/channel";

const gmailListSchema = z.object({
  messages: z
    .array(
      z.object({
        id: z.string(),
        threadId: z.string(),
      }),
    )
    .optional()
    .default([]),
});

const headerSchema = z.object({
  name: z.string(),
  value: z.string(),
});

const mimePartSchema: z.ZodType<GmailMimePart> = z.lazy(() =>
  z.object({
    mimeType: z.string().optional(),
    filename: z.string().optional(),
    headers: z.array(headerSchema).optional(),
    body: z
      .object({
        data: z.string().optional(),
        size: z.number().optional(),
        attachmentId: z.string().optional(),
      })
      .optional(),
    parts: z.array(mimePartSchema).optional(),
  }),
);

type GmailMimePart = {
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailMimePart[];
};

const gmailMessageSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  labelIds: z.array(z.string()).optional().default([]),
  snippet: z.string().optional().default(""),
  internalDate: z.string().optional(),
  payload: mimePartSchema.optional(),
});

const gmailSendSchema = z.object({
  id: z.string(),
  threadId: z.string().optional(),
});

function decodeBase64Url(value: string | undefined): string {
  if (!value) {
    return "";
  }
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return "";
  }
}

function decodeMimeHeader(value: string): string {
  return value.replace(
    /=\?([^?]+)\?([bqBQ])\?([^?]+)\?=/g,
    (_match, _charset: string, encoding: string, encoded: string) => {
      try {
        if (encoding.toLowerCase() === "b") {
          return Buffer.from(encoded, "base64").toString("utf8");
        }
        const bytes = encoded
          .replace(/_/g, " ")
          .replace(/=([A-Fa-f0-9]{2})/g, (_value: string, hex: string) =>
            String.fromCharCode(Number.parseInt(hex, 16)),
          );
        return Buffer.from(bytes, "binary").toString("utf8");
      } catch {
        return encoded;
      }
    },
  );
}

function getHeader(part: GmailMimePart | undefined, name: string): string {
  const header = part?.headers?.find(
    (item) => item.name.toLowerCase() === name.toLowerCase(),
  );
  return decodeMimeHeader(header?.value ?? "");
}

function splitAddresses(value: string): string[] {
  return value
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseMailAddress(value: string): MailAddress {
  const match = value.match(/^(.*?)<([^<>]+)>$/);
  if (match) {
    return {
      name: match[1].trim().replace(/^"|"$/g, "") || undefined,
      address: match[2].trim().toLowerCase(),
    };
  }
  const address = value.trim().replace(/^<|>$/g, "").toLowerCase();
  return { address };
}

function parseAddressList(value: string): MailAddress[] {
  return splitAddresses(value).map(parseMailAddress);
}

export function inferMailAccount(recipients: MailAddress[]): MailAccount {
  return recipients.some((recipient) =>
    /@(?:[^@.]+\.)*goodsystem\.jp$/i.test(recipient.address),
  )
    ? "goodsystem"
    : "gmail";
}

function normalizeReceivedAt(internalDate: string | undefined, dateHeader: string): string {
  const internalMilliseconds = Number(internalDate);
  const value = Number.isFinite(internalMilliseconds)
    ? new Date(internalMilliseconds)
    : new Date(dateHeader);
  return Number.isNaN(value.getTime())
    ? new Date(0).toISOString()
    : value.toISOString();
}

function categoryFromLabels(labels: string[]): string | undefined {
  if (labels.includes("CATEGORY_FORUMS")) {
    return "forums";
  }
  if (labels.includes("CATEGORY_PROMOTIONS")) {
    return "promotions";
  }
  if (labels.includes("CATEGORY_SOCIAL")) {
    return "social";
  }
  if (labels.includes("CATEGORY_UPDATES")) {
    return "updates";
  }
  return undefined;
}

function extractBodies(part: GmailMimePart | undefined): {
  text: string;
  html: string;
} {
  if (!part) {
    return { text: "", html: "" };
  }
  let text = "";
  let html = "";
  const visit = (item: GmailMimePart) => {
    const mimeType = item.mimeType?.toLowerCase();
    if (!item.filename && mimeType === "text/plain" && item.body?.data) {
      text += `${decodeBase64Url(item.body.data)}\n`;
    }
    if (!item.filename && mimeType === "text/html" && item.body?.data) {
      html += `${decodeBase64Url(item.body.data)}\n`;
    }
    item.parts?.forEach(visit);
  };
  visit(part);
  if (!text && part.body?.data && part.mimeType?.toLowerCase() !== "text/html") {
    text = decodeBase64Url(part.body.data);
  }
  if (!html && part.body?.data && part.mimeType?.toLowerCase() === "text/html") {
    html = decodeBase64Url(part.body.data);
  }
  return { text: text.trim(), html: html.trim() };
}

function formatQueryDate(date: Date): string {
  const overlap = new Date(date.getTime() - 24 * 60 * 60 * 1000);
  return `${overlap.getUTCFullYear()}/${String(overlap.getUTCMonth() + 1).padStart(2, "0")}/${String(overlap.getUTCDate()).padStart(2, "0")}`;
}

function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function encodeSubject(value: string): string {
  const sanitized = sanitizeHeader(value);
  return /[^\x20-\x7E]/.test(sanitized)
    ? `=?UTF-8?B?${Buffer.from(sanitized).toString("base64")}?=`
    : sanitized;
}

export class GmailRestChannel implements MailChannel {
  private readonly baseUrl = "https://gmail.googleapis.com/gmail/v1/users/me";

  constructor(
    private readonly accessToken: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
      cache: "no-store",
    });
    if (!response.ok) {
      throw new ExternalServiceError("gmail");
    }
    return response.json();
  }

  private async listIds(query: string, limit: number): Promise<Array<{ id: string; threadId: string }>> {
    if (limit <= 0) {
      return [];
    }
    const params = new URLSearchParams({
      q: query,
      maxResults: String(clampLimit(limit)),
    });
    const parsed = gmailListSchema.safeParse(
      await this.request(`/messages?${params.toString()}`),
    );
    if (!parsed.success) {
      throw new ExternalServiceError("gmail");
    }
    return parsed.data.messages;
  }

  private async getMessage(
    id: string,
    format: "metadata" | "full",
  ): Promise<z.infer<typeof gmailMessageSchema>> {
    const params = new URLSearchParams({ format });
    if (format === "metadata") {
      ["From", "To", "Subject", "Date", "Message-ID"].forEach((header) =>
        params.append("metadataHeaders", header),
      );
    }
    const parsed = gmailMessageSchema.safeParse(
      await this.request(
        `/messages/${encodeURIComponent(id)}?${params.toString()}`,
      ),
    );
    if (!parsed.success) {
      throw new ExternalServiceError("gmail");
    }
    return parsed.data;
  }

  private toSummary(
    message: z.infer<typeof gmailMessageSchema>,
  ): MailMessageSummary {
    const from = parseMailAddress(getHeader(message.payload, "From"));
    const to = parseAddressList(getHeader(message.payload, "To"));
    return {
      externalId: message.id,
      threadId: message.threadId,
      channel: "gmail",
      account: inferMailAccount(to),
      from,
      to,
      subject: getHeader(message.payload, "Subject") || "(no subject)",
      snippet: message.snippet,
      receivedAt: normalizeReceivedAt(
        message.internalDate,
        getHeader(message.payload, "Date"),
      ),
      labels: message.labelIds,
      isRead: !message.labelIds.includes("UNREAD"),
    };
  }

  async fetchMessages(
    options: FetchMessagesOptions = {},
  ): Promise<MailMessageSummary[]> {
    const limit = clampLimit(options.limit);
    const queryParts = ["-category:promotions", "-category:social"];
    if (options.unreadOnly !== false) {
      queryParts.push("is:unread");
    }
    if (options.since) {
      queryParts.push(`after:${formatQueryDate(options.since)}`);
    }
    const baseQuery = queryParts.join(" ");
    const forumIds = await this.listIds(`category:forums ${baseQuery}`, limit);
    const remaining = Math.max(0, limit - forumIds.length);
    const otherIds = await this.listIds(
      `-category:forums ${baseQuery}`,
      remaining,
    );
    const uniqueIds = [
      ...new Map(
        [...forumIds, ...otherIds].map((message) => [message.id, message]),
      ).values(),
    ].slice(0, limit);
    const messages: Array<z.infer<typeof gmailMessageSchema>> = [];
    for (let index = 0; index < uniqueIds.length; index += 5) {
      const batch = uniqueIds.slice(index, index + 5);
      messages.push(
        ...(await Promise.all(
          batch.map((message) => this.getMessage(message.id, "metadata")),
        )),
      );
    }
    return messages
      .map((message) => this.toSummary(message))
      .filter((message) => {
        const category = categoryFromLabels(message.labels);
        return category !== "promotions" && category !== "social";
      })
      .sort((left, right) => {
        const leftForum = left.labels.includes("CATEGORY_FORUMS") ? 1 : 0;
        const rightForum = right.labels.includes("CATEGORY_FORUMS") ? 1 : 0;
        return (
          rightForum - leftForum ||
          Date.parse(right.receivedAt) - Date.parse(left.receivedAt)
        );
      });
  }

  async readMessage(messageId: string): Promise<MailMessage> {
    const message = await this.getMessage(messageId, "full");
    const summary = this.toSummary(message);
    const bodies = extractBodies(message.payload);
    const bodyText =
      bodies.text ||
      (bodies.html
        ? convert(bodies.html, {
            wordwrap: false,
            selectors: [
              { selector: "img", format: "skip" },
              { selector: "script", format: "skip" },
              { selector: "style", format: "skip" },
            ],
          }).trim()
        : "");
    return {
      ...summary,
      bodyText,
      bodyHtml: bodies.html || undefined,
      providerUrl: `https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(message.id)}`,
      internetMessageId: getHeader(message.payload, "Message-ID") || undefined,
    };
  }

  async sendReply(input: SendReplyInput): Promise<SendReplyResult> {
    if (!input.threadId) {
      throw new ApiError(
        422,
        "THREAD_ID_REQUIRED",
        "Gmail replies require a threadId",
      );
    }
    const subject = input.subject.toLowerCase().startsWith("re:")
      ? input.subject
      : `Re: ${input.subject}`;
    const rawMessage = [
      `To: ${sanitizeHeader(input.to.address)}`,
      `Subject: ${encodeSubject(subject)}`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      input.bodyText,
    ].join("\r\n");
    const parsed = gmailSendSchema.safeParse(
      await this.request("/messages/send", {
        method: "POST",
        body: JSON.stringify({
          raw: Buffer.from(rawMessage).toString("base64url"),
          threadId: input.threadId,
        }),
      }),
    );
    if (!parsed.success) {
      throw new ExternalServiceError("gmail");
    }
    return {
      externalId: parsed.data.id,
      threadId: parsed.data.threadId,
    };
  }

  async fetchSentMessages(limit = 30): Promise<MailMessage[]> {
    const ids = await this.listIds("in:sent", clampLimit(limit, 30));
    return Promise.all(ids.map((message) => this.readMessage(message.id)));
  }

  async markAsRead(messageId: string): Promise<void> {
    await this.request(`/messages/${encodeURIComponent(messageId)}/modify`, {
      method: "POST",
      body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
    });
  }
}
