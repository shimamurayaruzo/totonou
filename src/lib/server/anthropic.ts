import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { classifyMailDeterministically } from "@/lib/domain/mail-triage";
import { serverEnv } from "@/lib/server/env";
import { ExternalServiceError } from "@/lib/server/http";
import type {
  MailStyleProfile,
  ScheduleCandidate,
  TaskRecord,
  TriageResult,
} from "@/lib/server/models";

export const triageOutputSchema = z.object({
  category: z.enum([
    "reply_required",
    "action_required",
    "information",
    "ignore",
  ]),
  priority: z.enum(["urgent", "today", "anytime"]),
  taskType: z.enum(["sukima", "jikkuri"]),
  reason: z.string().min(1).max(300),
  taskTitle: z.string().min(1).max(120),
});

export const summaryOutputSchema = z.object({
  summary: z.string().min(1).max(500),
  keyPoints: z.array(z.string().min(1).max(200)).max(5),
});

export const threeSecondSummaryOutputSchema = z.object({
  summary: z.string().min(1).max(160),
  cheer: z.string().min(1).max(100),
});

export const replyDraftOutputSchema = z.object({
  subject: z.string().min(1).max(200),
  bodyText: z.string().min(1).max(5000),
});

export const dailyReviewOutputSchema = z.object({
  result: z.string().min(1).max(2000),
  goodJob: z.string().min(1).max(2000),
  badJob: z.string().min(1).max(2000),
  rules: z.string().min(1).max(2000),
  improvements: z.string().min(1).max(2000),
  cheer: z.string().min(1).max(500),
});

export const coachOutputSchema = z.object({
  message: z.string().min(1).max(160),
});

export const styleProfileOutputSchema = z.object({
  greeting: z.string().max(100),
  closing: z.string().max(100),
  formality: z.enum(["casual", "balanced", "formal"]),
  averageLength: z.number().int().nonnegative().max(10000),
  usesEmoji: z.boolean(),
  notes: z.array(z.string().min(1).max(200)).max(10),
});

export const scheduleCandidateOutputSchema = z.object({
  candidates: z
    .array(
      z
        .object({
          title: z.string().min(1).max(200),
          startAt: z.string().datetime({ offset: true }),
          endAt: z.string().datetime({ offset: true }),
          timezone: z.string().min(1).max(100),
          location: z.string().max(300).optional(),
          confidence: z.number().min(0).max(1),
        })
        .refine(
          (candidate) =>
            Date.parse(candidate.endAt) > Date.parse(candidate.startAt),
          { message: "endAt must be after startAt" },
        ),
    )
    .max(10),
});

export type AiResult<T> = {
  data: T;
  model: string;
  tokensIn: number;
  tokensOut: number;
  demo: boolean;
};

type TriageInput = {
  subject: string;
  bodyText: string;
  senderAddress: string;
};

type BriefingInput = {
  eventCount: number;
  replyCount: number;
  taskCount: number;
  openAfternoon: boolean;
  dreams?: string;
  monthlyGoals?: string;
};

type DailyReviewInput = {
  date: string;
  goal: string;
  completedTasks: TaskRecord[];
  totalMinutes: number;
  activitySummary?: string[];
};

function extractJson(value: string): unknown {
  const withoutFence = value
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/, "")
    .trim();
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new ExternalServiceError("anthropic", "Claude returned invalid JSON");
  }
  try {
    return JSON.parse(withoutFence.slice(start, end + 1));
  } catch {
    throw new ExternalServiceError("anthropic", "Claude returned invalid JSON");
  }
}

function demoTriage(input: TriageInput): TriageResult {
  return triageOutputSchema.parse(classifyMailDeterministically(input));
}

function demoSummary(bodyText: string): z.infer<typeof summaryOutputSchema> {
  const compact = bodyText.replace(/\s+/g, " ").trim();
  const firstSentence = compact.split(/(?<=[。！？.!?])\s*/)[0] || "本文を確認してください。";
  return summaryOutputSchema.parse({
    summary: firstSentence.slice(0, 300),
    keyPoints: [firstSentence.slice(0, 180)],
  });
}

function demoReply(
  subject: string,
  style?: MailStyleProfile | null,
): z.infer<typeof replyDraftOutputSchema> {
  const greeting = style?.greeting || "お世話になっております。";
  const closing = style?.closing || "どうぞよろしくお願いいたします。";
  return replyDraftOutputSchema.parse({
    subject: subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`,
    bodyText: `${greeting}\n\nご連絡ありがとうございます。内容を確認いたしました。対応のうえ、必要があれば改めてご連絡いたします。\n\n${closing}`,
  });
}

function countEmoji(value: string): number {
  return (value.match(/[\p{Extended_Pictographic}]/gu) ?? []).length;
}

function demoStyle(samples: string[]): MailStyleProfile {
  const averageLength = samples.length
    ? Math.round(
        samples.reduce((total, sample) => total + sample.length, 0) /
          samples.length,
      )
    : 0;
  const joined = samples.join("\n");
  const formal = /(お世話になっております|よろしくお願いいたします|申し上げます)/.test(
    joined,
  );
  return styleProfileOutputSchema.parse({
    greeting: formal ? "お世話になっております。" : "こんにちは。",
    closing: formal ? "どうぞよろしくお願いいたします。" : "よろしくお願いします。",
    formality: formal ? "formal" : "balanced",
    averageLength,
    usesEmoji: countEmoji(joined) > 0,
    notes: ["簡潔に結論を伝える", "相手へのお礼を冒頭に置く"],
  });
}

function parseDemoSchedule(
  text: string,
  referenceDate: string,
  defaultTitle: string,
): ScheduleCandidate[] {
  const isoMatch = text.match(
    /(20\d{2})[-/]([01]?\d)[-/]([0-3]?\d)[^\d]{0,6}([0-2]?\d)(?::|時)([0-5]?\d)?/,
  );
  const japaneseMatch = text.match(
    /([01]?\d)月([0-3]?\d)日[^\d]{0,8}([0-2]?\d)(?::|時)([0-5]?\d)?/,
  );
  const relativeMatch = text.match(
    /(明日|あした|今日|本日)[^\d]{0,8}([0-2]?\d)(?::|時)([0-5]?\d)?/,
  );
  let year: number;
  let month: number;
  let day: number;
  let hour: number;
  let minute: number;
  const reference = new Date(referenceDate);
  if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
    hour = Number(isoMatch[4]);
    minute = Number(isoMatch[5] ?? 0);
  } else if (japaneseMatch) {
    year = reference.getUTCFullYear();
    month = Number(japaneseMatch[1]);
    day = Number(japaneseMatch[2]);
    hour = Number(japaneseMatch[3]);
    minute = Number(japaneseMatch[4] ?? 0);
  } else if (relativeMatch) {
    const base = new Date(reference);
    if (/明日|あした/.test(relativeMatch[1])) {
      base.setUTCDate(base.getUTCDate() + 1);
    }
    year = base.getUTCFullYear();
    month = base.getUTCMonth() + 1;
    day = base.getUTCDate();
    hour = Number(relativeMatch[2]);
    minute = Number(relativeMatch[3] ?? 0);
  } else {
    return [];
  }
  const startAt = new Date(
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+09:00`,
  );
  if (Number.isNaN(startAt.getTime())) {
    return [];
  }
  const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
  return scheduleCandidateOutputSchema.parse({
    candidates: [
      {
        title: defaultTitle || "打ち合わせ",
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        timezone: "Asia/Tokyo",
        confidence: 0.8,
      },
    ],
  }).candidates;
}

export class TotonouAnthropic {
  private readonly client: Anthropic | null;

  constructor(apiKey = serverEnv.ANTHROPIC_API_KEY) {
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
  }

  get demo(): boolean {
    return this.client === null;
  }

  private async generate<T>(
    schema: z.ZodType<T>,
    model: string,
    system: string,
    input: unknown,
    demoData: T,
    maxTokens = 1200,
  ): Promise<AiResult<T>> {
    if (!this.client) {
      return {
        data: schema.parse(demoData),
        model: "deterministic-demo",
        tokensIn: 0,
        tokensOut: 0,
        demo: true,
      };
    }
    try {
      const response = await this.client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature: 0,
        system: `${system}\nReturn one JSON object only. Do not use markdown fences.`,
        messages: [
          {
            role: "user",
            content: JSON.stringify(input),
          },
        ],
      });
      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n");
      const parsed = schema.safeParse(extractJson(text));
      if (!parsed.success) {
        throw new ExternalServiceError(
          "anthropic",
          "Claude output failed schema validation",
        );
      }
      return {
        data: parsed.data,
        model,
        tokensIn: response.usage.input_tokens,
        tokensOut: response.usage.output_tokens,
        demo: false,
      };
    } catch (error) {
      if (error instanceof ExternalServiceError) {
        throw error;
      }
      throw new ExternalServiceError("anthropic");
    }
  }

  async triage(input: TriageInput): Promise<AiResult<TriageResult>> {
    return this.generate(
      triageOutputSchema,
      serverEnv.ANTHROPIC_TRIAGE_MODEL,
      "Classify one email for a personal work assistant. Use reply_required, action_required, information, or ignore. Use urgent, today, or anytime priority and sukima or jikkuri task type. Keep the reason concise and write a clear action title in Japanese.",
      input,
      demoTriage(input),
      600,
    );
  }

  async summarize(
    subject: string,
    bodyText: string,
  ): Promise<AiResult<z.infer<typeof summaryOutputSchema>>> {
    return this.generate(
      summaryOutputSchema,
      serverEnv.ANTHROPIC_TRIAGE_MODEL,
      "Summarize the email in Japanese and return a short summary and up to five key points.",
      { subject, bodyText },
      demoSummary(bodyText),
      700,
    );
  }

  async createThreeSecondSummary(
    input: BriefingInput,
  ): Promise<AiResult<z.infer<typeof threeSecondSummaryOutputSchema>>> {
    const afternoon = input.openAfternoon ? "午後にはまとまった空きがあります。" : "予定の合間を活用しましょう。";
    const demoData = threeSecondSummaryOutputSchema.parse({
      summary: `今日は予定${input.eventCount}件、要返信${input.replyCount}件、タスク${input.taskCount}件。${afternoon}`,
      cheer: "優先度の高いものから一つずつ整えていきましょう。",
    });
    return this.generate(
      threeSecondSummaryOutputSchema,
      serverEnv.ANTHROPIC_TRIAGE_MODEL,
      "Create a three-second morning briefing summary and one encouraging sentence in Japanese. Do not invent counts.",
      input,
      demoData,
      400,
    );
  }

  async draftReply(input: {
    subject: string;
    bodyText: string;
    summary?: string;
    style?: MailStyleProfile | null;
    instruction?: string;
  }): Promise<AiResult<z.infer<typeof replyDraftOutputSchema>>> {
    return this.generate(
      replyDraftOutputSchema,
      serverEnv.ANTHROPIC_GENERATION_MODEL,
      "Draft a polite Japanese email reply for human review. Never claim an action was completed unless the instruction says so. Match the supplied style profile.",
      input,
      demoReply(input.subject, input.style),
      1400,
    );
  }

  async generateDailyReview(
    input: DailyReviewInput,
  ): Promise<AiResult<z.infer<typeof dailyReviewOutputSchema>>> {
    const completedTitles = input.completedTasks.map((task) => task.title);
    const demoData = dailyReviewOutputSchema.parse({
      result: completedTitles.length
        ? `${completedTitles.length}件を完了しました。合計${input.totalMinutes}分取り組みました。`
        : "完了したタスクはありませんでした。明日に向けて優先順位を整えます。",
      goodJob: completedTitles.length
        ? "着手と完了を記録し、実績を残せました。"
        : "振り返りの時間を確保できました。",
      badJob: "予定と実績の差を次回の見積もりに反映します。",
      rules: "優先度の高いタスクは午前中に最初の一歩を始めます。",
      improvements: "開始前に完了条件を一文で決め、見積時間を小さく区切ります。",
      cheer: "今日の記録が、明日の迷いを一つ減らしてくれます。",
    });
    return this.generate(
      dailyReviewOutputSchema,
      serverEnv.ANTHROPIC_GENERATION_MODEL,
      "Draft a factual Japanese daily review from the supplied completed tasks and activity summary. Include result, good job, reflection, reusable rule, improvement, and encouragement. Do not invent achievements.",
      input,
      demoData,
      1800,
    );
  }

  async generateCoachMessage(input: {
    trigger: "start" | "pomodoro" | "break_end" | "idle";
    persona: "gentle_secretary" | "passionate_coach" | "butler";
    taskTitle?: string;
    completedPomodoros?: number;
  }): Promise<AiResult<z.infer<typeof coachOutputSchema>>> {
    const messages = {
      gentle_secretary: {
        start: "始められたことが第一歩です。25分だけ、目の前の作業に集中しましょう。",
        pomodoro: "25分おつかれさまでした。いったん手を止めて、短く休憩しましょう。",
        break_end: "休憩できました。次の一区切りも、無理なく進めましょう。",
        idle: "優先タスクが待っています。まず5分だけ着手してみませんか。",
      },
      passionate_coach: {
        start: "よし、ここから25分です。終わらせる一歩を積み上げましょう。",
        pomodoro: "一区切り達成です。休憩して、次の集中に備えましょう。",
        break_end: "準備は整いました。次の25分も一気に進めましょう。",
        idle: "今が始めどきです。最優先タスクに5分だけ飛び込みましょう。",
      },
      butler: {
        start: "承知いたしました。まず25分、こちらの作業に集中なさってください。",
        pomodoro: "一区切りでございます。5分ほどお休みください。",
        break_end: "休憩のお時間が終わりました。次の作業をご案内いたします。",
        idle: "最優先のご用件が未着手です。まず5分だけ進めてはいかがでしょう。",
      },
    } as const;
    const demoData = coachOutputSchema.parse({
      message: messages[input.persona][input.trigger],
    });
    return this.generate(
      coachOutputSchema,
      serverEnv.ANTHROPIC_TRIAGE_MODEL,
      "Write one short Japanese text-only coaching message. Respect the persona and trigger. Do not mention audio and do not interrupt outside the supplied trigger.",
      input,
      demoData,
      300,
    );
  }

  async learnReplyStyle(
    samples: string[],
  ): Promise<AiResult<MailStyleProfile>> {
    const limitedSamples = samples.slice(0, 100).map((sample) => sample.slice(0, 5000));
    return this.generate(
      styleProfileOutputSchema,
      serverEnv.ANTHROPIC_GENERATION_MODEL,
      "Analyze only writing style from sent email samples. Return greeting, closing, formality, average character length, emoji usage, and reusable style notes. Do not include names, addresses, company names, or message content in notes.",
      { samples: limitedSamples },
      demoStyle(limitedSamples),
      1000,
    );
  }

  async extractScheduleCandidates(input: {
    subject: string;
    bodyText: string;
    referenceDate: string;
    timezone?: string;
  }): Promise<AiResult<{ candidates: ScheduleCandidate[] }>> {
    const demoData = scheduleCandidateOutputSchema.parse({
      candidates: parseDemoSchedule(
        input.bodyText,
        input.referenceDate,
        input.subject,
      ),
    });
    return this.generate(
      scheduleCandidateOutputSchema,
      serverEnv.ANTHROPIC_TRIAGE_MODEL,
      "Extract explicit meeting date and time candidates. Resolve relative dates from referenceDate, normalize startAt and endAt to ISO 8601 with an offset, default duration to 60 minutes only when no end is present, and return no candidates when evidence is insufficient.",
      { ...input, timezone: input.timezone ?? "Asia/Tokyo" },
      demoData,
      900,
    );
  }
}

export const anthropic = new TotonouAnthropic();
