import "server-only";

import { log } from "@/lib/logger";
import { anthropic } from "@/lib/server/anthropic";
import { parseDomainList, serverEnv } from "@/lib/server/env";
import { createMailChannel } from "@/lib/server/mail";
import type {
  MailChannelName,
  MailMessage,
  MailMessageSummary,
  TriageCategory,
} from "@/lib/server/models";
import type {
  MessageInput,
  TotonouRepository,
} from "@/lib/server/repository";

export type FetchMailInput = {
  repository: TotonouRepository;
  channelName: MailChannelName;
  providerAccessToken?: string;
  fetchRange: "latest_100" | "last_5_days";
  limit?: number;
  allowedDomains?: string[];
  blockedDomains?: string[];
  correlationId: string;
  userId?: string;
};

export type FetchMailResult = {
  correlationId: string;
  fetchedCount: number;
  duplicateCount: number;
  excludedCount: number;
  classifiedCount: number;
  taskCount: number;
  categoryCounts: Record<TriageCategory, number>;
  messages: Array<{
    id: string;
    externalId: string;
    category: TriageCategory | "excluded";
    taskId?: string;
  }>;
  demo: boolean;
  gmailConnected: boolean;
  persistenceConnected: boolean;
  aiConnected: boolean;
};

function domainOf(address: string): string {
  return address.split("@").at(-1)?.toLowerCase() ?? "";
}

function matchesDomain(domain: string, candidate: string): boolean {
  return domain === candidate || domain.endsWith(`.${candidate}`);
}

function isAutomatedSender(address: string): boolean {
  const local = address.split("@")[0]?.toLowerCase() ?? "";
  return (
    /(?:^|[._-])no[._-]?reply(?:$|[._+-])/.test(local) ||
    /(?:^|[._-])noreply(?:$|[._+-])/.test(local) ||
    local === "news" ||
    local.startsWith("news+") ||
    local === "info" ||
    local.startsWith("info+")
  );
}

function hasExcludedCategory(message: MailMessageSummary): boolean {
  return (
    message.labels.includes("CATEGORY_PROMOTIONS") ||
    message.labels.includes("CATEGORY_SOCIAL")
  );
}

function categoryFromLabels(labels: string[]): string | undefined {
  if (labels.includes("CATEGORY_FORUMS")) {
    return "forums";
  }
  if (labels.includes("CATEGORY_UPDATES")) {
    return "updates";
  }
  if (labels.includes("CATEGORY_PROMOTIONS")) {
    return "promotions";
  }
  if (labels.includes("CATEGORY_SOCIAL")) {
    return "social";
  }
  return undefined;
}

function toMessageInput(
  message: MailMessageSummary | MailMessage,
  extra: Partial<MessageInput> = {},
): MessageInput {
  const full = "bodyText" in message ? message : undefined;
  return {
    externalId: message.externalId,
    threadId: message.threadId,
    channel: message.channel,
    account: message.account,
    senderName: message.from.name,
    senderAddress: message.from.address,
    recipientAddresses: message.to.map((recipient) => recipient.address),
    subject: message.subject,
    bodyText: full?.bodyText ?? "",
    bodyHtml: full?.bodyHtml,
    snippet: message.snippet,
    receivedAt: new Date(message.receivedAt).toISOString(),
    category: categoryFromLabels(message.labels),
    isRead: message.isRead,
    providerUrl: full?.providerUrl,
    ...extra,
  };
}

function todayInTokyo(): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function safeReason(category: TriageCategory): string {
  const reasons: Record<TriageCategory, string> = {
    reply_required: "reply_requested",
    action_required: "action_requested",
    information: "information_only",
    ignore: "no_action_needed",
  };
  return reasons[category];
}

export async function fetchAndTriageMail(
  input: FetchMailInput,
): Promise<FetchMailResult> {
  const limit = Math.min(100, Math.max(1, Math.trunc(input.limit ?? 100)));
  const since =
    input.fetchRange === "last_5_days"
      ? new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
      : undefined;
  const allowedDomains = (
    input.allowedDomains ?? parseDomainList(serverEnv.MAIL_ALLOWED_DOMAINS)
  ).map((domain) => domain.toLowerCase());
  const blockedDomains = (
    input.blockedDomains ?? parseDomainList(serverEnv.MAIL_BLOCKED_DOMAINS)
  ).map((domain) => domain.toLowerCase());
  const channelResult = await createMailChannel(
    input.channelName,
    input.providerAccessToken,
  );

  await log.info("fetch_mail_batch_start", "Mail check started", {
    correlationId: input.correlationId,
    userId: input.userId,
    context: {
      mail: {
        channel: input.channelName,
        fetch_range: input.fetchRange,
        query: {
          unread_only: true,
          exclude_categories: ["promotions", "social"],
          limit,
        },
      },
    },
    humanNote: "Mail is filtered mechanically before AI classification.",
  });

  const fetched = await channelResult.channel.fetchMessages({
    limit,
    since,
    unreadOnly: true,
  });
  const uniqueMap = new Map<string, MailMessageSummary>();
  for (const message of fetched) {
    const key = `${message.channel}:${message.externalId}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, {
        ...message,
        receivedAt: new Date(message.receivedAt).toISOString(),
      });
    }
  }
  const unique = [...uniqueMap.values()].slice(0, limit);
  const duplicateCount = fetched.length - unique.length;

  const promotionExcluded = unique.filter(hasExcludedCategory);
  const afterCategory = unique.filter((message) => !hasExcludedCategory(message));
  await log.info("triage_exclude_rule", "Category exclusions applied", {
    correlationId: input.correlationId,
    userId: input.userId,
    context: {
      triage: { rule: "promotions_social", excluded_count: promotionExcluded.length },
    },
  });

  const automatedExcluded = afterCategory.filter((message) =>
    isAutomatedSender(message.from.address),
  );
  const afterAutomated = afterCategory.filter(
    (message) => !isAutomatedSender(message.from.address),
  );
  await log.info("triage_exclude_rule", "Automated sender exclusions applied", {
    correlationId: input.correlationId,
    userId: input.userId,
    context: {
      triage: { rule: "noreply", excluded_count: automatedExcluded.length },
    },
  });

  const domainExcluded = afterAutomated.filter((message) => {
    const domain = domainOf(message.from.address);
    const blocked = blockedDomains.some((item) => matchesDomain(domain, item));
    const allowed =
      allowedDomains.length === 0 ||
      allowedDomains.some((item) => matchesDomain(domain, item));
    return blocked || !allowed;
  });
  const candidates = afterAutomated.filter(
    (message) => !domainExcluded.includes(message),
  );
  await log.info("triage_exclude_rule", "Domain exclusions applied", {
    correlationId: input.correlationId,
    userId: input.userId,
    context: {
      triage: { rule: "domain", excluded_count: domainExcluded.length },
    },
  });

  const machineExcluded = [
    ...promotionExcluded,
    ...automatedExcluded,
    ...domainExcluded,
  ];
  const excludedInputs = machineExcluded.map((message) =>
    toMessageInput(message, {
      category: "excluded",
      triageResult: {
        category: "ignore",
        priority: "anytime",
        taskType: "sukima",
        reason: "機械的な除外ルールに一致しました。",
        taskTitle: "確認不要",
      },
    }),
  );
  const excludedStored = await input.repository.saveMessages(excludedInputs);
  const classifiedInputs: MessageInput[] = [];
  const triageByExternalId = new Map<
    string,
    Awaited<ReturnType<typeof anthropic.triage>>
  >();

  for (const summary of candidates) {
    const message = await channelResult.channel.readMessage(summary.externalId);
    const triage = await anthropic.triage({
      subject: message.subject,
      bodyText: message.bodyText,
      senderAddress: message.from.address,
    });
    triageByExternalId.set(message.externalId, triage);
    classifiedInputs.push(
      toMessageInput(message, {
        category: triage.data.category,
        triageResult: triage.data,
      }),
    );
    await log.info("triage_classify", "Mail classification completed", {
      correlationId: input.correlationId,
      userId: input.userId,
      context: {
        mail: { message_id: message.externalId },
        triage: {
          category: triage.data.category,
          priority: triage.data.priority,
          task_type: triage.data.taskType,
          reason: safeReason(triage.data.category),
          model: triage.model,
        },
      },
    });
  }

  const classifiedStored = await input.repository.saveMessages(classifiedInputs);
  const resultMessages: FetchMailResult["messages"] = excludedStored.map(
    (message) => ({
      id: message.id,
      externalId: message.externalId,
      category: "excluded",
    }),
  );
  let taskCount = 0;
  for (const message of classifiedStored) {
    const triage = triageByExternalId.get(message.externalId)?.data;
    if (!triage) {
      continue;
    }
    let taskId: string | undefined;
    if (triage.category === "reply_required") {
      const task = await input.repository.createTaskFromMessage(
        message.id,
        triage,
        todayInTokyo(),
      );
      taskId = task?.id;
      if (task) {
        taskCount += 1;
        await log.info("task_create", "Task created from mail", {
          correlationId: input.correlationId,
          userId: input.userId,
          context: {
            task: {
              task_id: task.id,
              source: "email",
              message_id: message.id,
            },
          },
        });
      }
    }
    resultMessages.push({
      id: message.id,
      externalId: message.externalId,
      category: triage.category,
      taskId,
    });
  }

  const categoryCounts: Record<TriageCategory, number> = {
    reply_required: 0,
    action_required: 0,
    information: 0,
    ignore: 0,
  };
  triageByExternalId.forEach((triage) => {
    categoryCounts[triage.data.category] += 1;
  });
  categoryCounts.ignore += machineExcluded.length;

  const result: FetchMailResult = {
    correlationId: input.correlationId,
    fetchedCount: fetched.length,
    duplicateCount,
    excludedCount: machineExcluded.length,
    classifiedCount: classifiedStored.length,
    taskCount,
    categoryCounts,
    messages: resultMessages,
    demo:
      input.repository.demo || channelResult.demo || anthropic.demo,
    gmailConnected: !channelResult.demo,
    persistenceConnected: !input.repository.demo,
    aiConnected: !anthropic.demo,
  };

  await log.info("fetch_mail_batch_complete", "Mail check completed", {
    correlationId: input.correlationId,
    userId: input.userId,
    context: {
      mail: {
        fetch_range: input.fetchRange,
        query: { limit },
        fetched_count: result.fetchedCount,
        duplicate_count: duplicateCount,
      },
      triage: {
        excluded_count: result.excludedCount,
        classified_count: result.classifiedCount,
        category_counts: result.categoryCounts,
      },
      task: { created_count: taskCount },
    },
    humanNote: "The mail check completed without automatic sending.",
  });

  return result;
}
