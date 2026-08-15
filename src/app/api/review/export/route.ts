import { z } from "zod";

import { escapeHtml } from "@/lib/domain/review";
import { log } from "@/lib/logger";
import { errorResponse, parseJson } from "@/lib/server/http";
import { getRepositoryContext } from "@/lib/server/repository";

const reviewSchema = z.object({
  id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  goal: z.string().max(5000),
  result: z.string().max(5000),
  goodJob: z.string().max(5000),
  badJob: z.string().max(5000),
  rules: z.string().max(5000),
  improvements: z.string().max(5000),
  cheer: z.string().max(5000),
});
const inputSchema = z.object({ review: reviewSchema });

function paragraph(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

function renderHtml(review: z.infer<typeof reviewSchema>): string {
  const sections = [
    ["今日の目標", review.goal],
    ["今日の結果", review.result],
    ["グッジョブ・感謝", review.goodJob],
    ["バッジョブ・反省", review.badJob],
    ["ルール化すること", review.rules],
    ["改善策", review.improvements],
    ["励まし・自分へのエール", review.cheer],
  ];
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Totonou 日報 ${escapeHtml(review.date)}</title><style>body{max-width:720px;margin:40px auto;padding:0 24px;color:#222a26;background:#f7f6f1;font-family:-apple-system,BlinkMacSystemFont,"Yu Gothic UI",sans-serif}h1{font-size:24px}time{color:#6e756f}section{margin:16px 0;padding:20px;border:1px solid #dedbd2;border-radius:12px;background:#fcfbf8}h2{margin:0 0 8px;color:#286f5a;font-size:13px}p{margin:0;line-height:1.8}</style></head><body><main><h1>Totonou 日報</h1><time>${escapeHtml(review.date)}</time>${sections.map(([label,value]) => `<section><h2>${label}</h2><p>${paragraph(value)}</p></section>`).join("")}</main></body></html>`;
}

export async function POST(request: Request): Promise<Response> {
  const correlationId = `export_${crypto.randomUUID()}`;
  try {
    const { review } = await parseJson(request, inputSchema);
    const context = await getRepositoryContext();
    const html = renderHtml(review);
    await context.repository.saveReviewExport(review.id, html);
    await log.info("review_export", "Daily review exported", {
      correlationId,
      userId: context.userId,
      context: { review: { review_id: review.id, date: review.date }, format: "html" },
    });
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="totonou-report-${review.date}.html"`,
      },
    });
  } catch (error) {
    return errorResponse(error, { operation: "review_export", correlationId });
  }
}
