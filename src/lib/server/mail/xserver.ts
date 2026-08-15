import "server-only";

import { convert } from "html-to-text";
import { ImapFlow, type FetchMessageObject } from "imapflow";
import nodemailer, { type Transporter } from "nodemailer";

import { clampLimit, ExternalServiceError } from "@/lib/server/http";
import type {
  FetchMessagesOptions,
  MailAddress,
  MailMessage,
  MailMessageSummary,
  SendReplyInput,
  SendReplyResult,
} from "@/lib/server/models";
import type { MailChannel } from "@/lib/server/mail/channel";

export type XserverChannelConfig = {
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  user: string;
  password: string;
  from: string;
};

type ParsedMimeMessage = {
  headers: Map<string, string>;
  text: string;
  html: string;
};

function normalizeDate(value: Date | string | undefined): string {
  const date = value ? new Date(value) : new Date(0);
  return Number.isNaN(date.getTime())
    ? new Date(0).toISOString()
    : date.toISOString();
}

function toMailAddress(value: {
  name?: string;
  address?: string;
} | undefined): MailAddress {
  return {
    name: value?.name || undefined,
    address: (value?.address ?? "unknown@example.invalid").toLowerCase(),
  };
}

function decodeQuotedPrintable(value: string): string {
  const unfolded = value.replace(/=\r?\n/g, "");
  const binary = unfolded.replace(/=([A-Fa-f0-9]{2})/g, (_match, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
  return Buffer.from(binary, "binary").toString("utf8");
}

function decodePartBody(body: string, encoding: string): string {
  if (encoding.toLowerCase() === "base64") {
    try {
      return Buffer.from(body.replace(/\s/g, ""), "base64").toString("utf8");
    } catch {
      return "";
    }
  }
  if (encoding.toLowerCase() === "quoted-printable") {
    return decodeQuotedPrintable(body);
  }
  return body;
}

function parseHeaders(value: string): Map<string, string> {
  const headers = new Map<string, string>();
  const unfolded = value.replace(/\r?\n[\t ]+/g, " ");
  for (const line of unfolded.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 1) {
      continue;
    }
    const key = line.slice(0, separator).trim().toLowerCase();
    const content = line.slice(separator + 1).trim();
    headers.set(key, headers.has(key) ? `${headers.get(key)}, ${content}` : content);
  }
  return headers;
}

function splitRawMessage(source: string): {
  headers: Map<string, string>;
  body: string;
} {
  const separator = source.search(/\r?\n\r?\n/);
  if (separator === -1) {
    return { headers: new Map(), body: source };
  }
  const headerText = source.slice(0, separator);
  const body = source.slice(separator).replace(/^\r?\n\r?\n/, "");
  return { headers: parseHeaders(headerText), body };
}

function boundaryFromContentType(contentType: string): string | undefined {
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
  return match?.[1] ?? match?.[2];
}

function parseMimeEntity(source: string): ParsedMimeMessage {
  const root = splitRawMessage(source);
  const textParts: string[] = [];
  const htmlParts: string[] = [];

  const visit = (headers: Map<string, string>, body: string) => {
    const contentType = headers.get("content-type") ?? "text/plain";
    const boundary = boundaryFromContentType(contentType);
    if (/^multipart\//i.test(contentType) && boundary) {
      const marker = `--${boundary}`;
      body
        .split(marker)
        .slice(1)
        .filter((part) => !part.trim().startsWith("--"))
        .forEach((part) => {
          const child = splitRawMessage(part.replace(/^\r?\n/, ""));
          visit(child.headers, child.body.replace(/\r?\n$/, ""));
        });
      return;
    }
    const disposition = headers.get("content-disposition") ?? "";
    if (/attachment/i.test(disposition)) {
      return;
    }
    const decoded = decodePartBody(
      body,
      headers.get("content-transfer-encoding") ?? "",
    ).trim();
    if (/^text\/html/i.test(contentType)) {
      htmlParts.push(decoded);
    } else if (/^text\/plain/i.test(contentType)) {
      textParts.push(decoded);
    }
  };

  visit(root.headers, root.body);
  return {
    headers: root.headers,
    text: textParts.join("\n\n").trim(),
    html: htmlParts.join("\n\n").trim(),
  };
}

function uidFromMessageId(messageId: string): number {
  const value = Number(messageId.replace(/^xserver:/, ""));
  if (!Number.isInteger(value) || value <= 0) {
    throw new ExternalServiceError("xserver_imap", "Invalid IMAP message id", 422);
  }
  return value;
}

export class XserverMailChannel implements MailChannel {
  private readonly transporter: Transporter;

  constructor(private readonly config: XserverChannelConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: { user: config.user, pass: config.password },
    });
  }

  private createImapClient(): ImapFlow {
    return new ImapFlow({
      host: this.config.imapHost,
      port: this.config.imapPort,
      secure: this.config.imapSecure,
      auth: { user: this.config.user, pass: this.config.password },
      logger: false,
    });
  }

  private toSummary(message: FetchMessageObject): MailMessageSummary {
    const envelope = message.envelope;
    return {
      externalId: `xserver:${message.uid}`,
      channel: "xserver",
      account: "goodsystem",
      from: toMailAddress(envelope?.from?.[0]),
      to: (envelope?.to ?? []).map((address) => toMailAddress(address)),
      subject: envelope?.subject ?? "(no subject)",
      snippet: "",
      receivedAt: normalizeDate(message.internalDate ?? envelope?.date),
      labels: [],
      isRead: message.flags?.has("\\Seen") ?? false,
    };
  }

  async fetchMessages(
    options: FetchMessagesOptions = {},
  ): Promise<MailMessageSummary[]> {
    const client = this.createImapClient();
    try {
      await client.connect();
      await client.mailboxOpen("INBOX");
      const since = options.since
        ? new Date(options.since.getTime() - 24 * 60 * 60 * 1000)
        : undefined;
      const ids = await client.search(
        {
          all: options.unreadOnly === false ? true : undefined,
          seen: options.unreadOnly === false ? undefined : false,
          since,
        },
        { uid: true },
      );
      if (!ids || ids.length === 0) {
        return [];
      }
      const selected = [...new Set(ids)]
        .sort((left, right) => right - left)
        .slice(0, clampLimit(options.limit));
      const messages = await client.fetchAll(
        selected,
        { uid: true, envelope: true, internalDate: true, flags: true },
        { uid: true },
      );
      return messages
        .map((message) => this.toSummary(message))
        .sort(
          (left, right) =>
            Date.parse(right.receivedAt) - Date.parse(left.receivedAt),
        );
    } catch {
      throw new ExternalServiceError("xserver_imap");
    } finally {
      if (client.usable) {
        await client.logout().catch(() => undefined);
      }
    }
  }

  async readMessage(messageId: string): Promise<MailMessage> {
    const client = this.createImapClient();
    try {
      await client.connect();
      await client.mailboxOpen("INBOX");
      const message = await client.fetchOne(
        uidFromMessageId(messageId),
        {
          uid: true,
          envelope: true,
          internalDate: true,
          flags: true,
          source: true,
        },
        { uid: true },
      );
      if (!message || !message.source) {
        throw new ExternalServiceError("xserver_imap", "Message not found", 404);
      }
      const summary = this.toSummary(message);
      const parsed = parseMimeEntity(message.source.toString("utf8"));
      const bodyText =
        parsed.text ||
        (parsed.html
          ? convert(parsed.html, {
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
        bodyHtml: parsed.html || undefined,
        internetMessageId: message.envelope?.messageId,
      };
    } catch (error) {
      if (error instanceof ExternalServiceError) {
        throw error;
      }
      throw new ExternalServiceError("xserver_imap");
    } finally {
      if (client.usable) {
        await client.logout().catch(() => undefined);
      }
    }
  }

  async sendReply(input: SendReplyInput): Promise<SendReplyResult> {
    try {
      const result = await this.transporter.sendMail({
        from: this.config.from,
        to: input.to.address,
        subject: input.subject.toLowerCase().startsWith("re:")
          ? input.subject
          : `Re: ${input.subject}`,
        text: input.bodyText,
        inReplyTo: input.inReplyTo,
        references: input.inReplyTo ? [input.inReplyTo] : undefined,
      });
      return { externalId: result.messageId };
    } catch {
      throw new ExternalServiceError("xserver_smtp");
    }
  }

  async markAsRead(messageId: string): Promise<void> {
    const client = this.createImapClient();
    try {
      await client.connect();
      await client.mailboxOpen("INBOX");
      const updated = await client.messageFlagsAdd(
        uidFromMessageId(messageId),
        ["\\Seen"],
        { uid: true },
      );
      if (!updated) {
        throw new ExternalServiceError("xserver_imap");
      }
    } catch (error) {
      if (error instanceof ExternalServiceError) {
        throw error;
      }
      throw new ExternalServiceError("xserver_imap");
    } finally {
      if (client.usable) {
        await client.logout().catch(() => undefined);
      }
    }
  }
}
