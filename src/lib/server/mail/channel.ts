import "server-only";

import type {
  FetchMessagesOptions,
  MailMessage,
  MailMessageSummary,
  SendReplyInput,
  SendReplyResult,
} from "@/lib/server/models";

export interface MailChannel {
  fetchMessages(options?: FetchMessagesOptions): Promise<MailMessageSummary[]>;
  readMessage(messageId: string): Promise<MailMessage>;
  sendReply(input: SendReplyInput): Promise<SendReplyResult>;
  markAsRead(messageId: string): Promise<void>;
}
