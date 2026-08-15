import { z } from "zod";

import { log } from "@/lib/logger";
import { anthropic } from "@/lib/server/anthropic";
import { errorResponse, parseOptionalJson } from "@/lib/server/http";
import { createMailChannel, GmailRestChannel } from "@/lib/server/mail";
import { getRepositoryContext } from "@/lib/server/repository";

const inputSchema = z.object({
  samples: z.array(z.string().min(1).max(5000)).max(100).optional(),
  limit: z.number().int().min(1).max(100).default(30),
});

export async function POST(request: Request): Promise<Response> {
  const correlationId = `style_${crypto.randomUUID()}`;
  try {
    const input = await parseOptionalJson(request, inputSchema);
    const context = await getRepositoryContext();
    let samples = input.samples ?? [];
    let channelDemo = true;
    if (samples.length === 0) {
      const mail = await createMailChannel("gmail", context.providerAccessToken);
      channelDemo = mail.demo;
      if (mail.channel instanceof GmailRestChannel) {
        const sent = await mail.channel.fetchSentMessages(input.limit);
        samples = sent.map((message) => message.bodyText).filter(Boolean);
      }
    }
    if (samples.length === 0) {
      samples = [
        "お世話になっております。ご連絡ありがとうございます。内容を確認いたしました。どうぞよろしくお願いいたします。",
        "お世話になっております。承知いたしました。確認のうえ改めてご連絡します。よろしくお願いいたします。",
      ];
    }
    const generated = await anthropic.learnReplyStyle(samples);
    await context.repository.saveStyleProfile(generated.data, samples.length);
    await log.info("style_profile_learn", "Reply style profile learned", {
      correlationId,
      userId: context.userId,
      context: {
        style: {
          sample_count: samples.length,
          formality: generated.data.formality,
          average_length: generated.data.averageLength,
          uses_emoji: generated.data.usesEmoji,
        },
        ai: { model: generated.model },
      },
    });
    return Response.json({ profile: generated.data, sampleCount: samples.length, demo: context.demo || channelDemo || generated.demo });
  } catch (error) {
    return errorResponse(error, { operation: "style_profile_learn", correlationId });
  }
}
