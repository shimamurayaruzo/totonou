import { z } from "zod";

import { log } from "@/lib/logger";
import { anthropic } from "@/lib/server/anthropic";
import { errorResponse, parseJson } from "@/lib/server/http";
import { getRepositoryContext } from "@/lib/server/repository";

const inputSchema = z.object({
  trigger: z.enum(["start", "pomodoro", "break_end", "idle"]),
  persona: z.enum(["gentle_secretary", "passionate_coach", "butler"]).optional(),
  taskTitle: z.string().max(300).optional(),
  completedPomodoros: z.number().int().nonnegative().optional(),
});

export async function POST(request: Request): Promise<Response> {
  const correlationId = `coach_${crypto.randomUUID()}`;
  try {
    const input = await parseJson(request, inputSchema);
    const context = await getRepositoryContext();
    const settings = await context.repository.getSettings();
    const generated = await anthropic.generateCoachMessage({
      ...input,
      persona: input.persona ?? settings.coachPersona,
    });
    await log.info("voice_coach_speak", "Text coach notification generated", {
      correlationId,
      userId: context.userId,
      context: {
        coach: {
          trigger: input.trigger,
          persona: input.persona ?? settings.coachPersona,
          tts: "none",
          channel: "text",
        },
        ai: { model: generated.model },
      },
    });
    return Response.json({ message: generated.data.message, channel: "text", demo: context.demo || generated.demo });
  } catch (error) {
    return errorResponse(error, { operation: "voice_coach_speak", correlationId });
  }
}
