import { describe, expect, it } from "vitest";

import { createSeedState, DEMO_USER_ID } from "../seed-data";
import {
  aggregateWeeklyReview,
  comparePlannedAndActual,
  exportDailyReviewHtml,
  generateDailyReviewDraft,
  generateGroundedPraise,
} from "./review";

describe("daily review", () => {
  const state = createSeedState("2026-08-15");

  it("compares planned and actual minutes without mutating source data", () => {
    const before = JSON.stringify(state.tasks);
    const comparison = comparePlannedAndActual(
      state.calendarEvents,
      state.tasks,
      state.asOfDate,
      DEMO_USER_ID,
    );

    expect(comparison.length).toBeGreaterThan(0);
    expect(comparison.every((item) => item.plannedMinutes >= 0)).toBe(true);
    expect(JSON.stringify(state.tasks)).toBe(before);
  });

  it("drafts a factual result from completed work and safe activity metadata", () => {
    const draft = generateDailyReviewDraft({
      userId: DEMO_USER_ID,
      date: state.asOfDate,
      goal: "今日の確認を終える",
      tasks: state.tasks,
      activityLogs: state.activityLogs,
      calendarEvents: state.calendarEvents,
      generatedAt: "2026-08-15T12:00:00.000Z",
    });

    expect(draft.goal).toBe("今日の確認を終える");
    expect(draft.result).toContain("件を完了");
    expect(draft.sourceTaskIds.length).toBeGreaterThan(0);
    expect(draft.status).toBe("draft");
  });

  it("escapes editable content in exported HTML", () => {
    const review = {
      ...state.dailyReviews[0],
      goal: '<script>alert("x")</script>',
      cheer: "A&B",
    };
    const html = exportDailyReviewHtml(review);

    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("A&amp;B");
  });
});

describe("weekly review and grounded praise", () => {
  const state = createSeedState("2026-08-15");
  const weekStart = "2026-08-08";
  const weekEnd = "2026-08-14";

  it("aggregates completion and minutes for one user", () => {
    const review = aggregateWeeklyReview({
      userId: DEMO_USER_ID,
      weekStart,
      weekEnd,
      tasks: state.tasks,
      dailyReviews: state.dailyReviews,
      generatedAt: "2026-08-15T12:00:00.000Z",
    });

    expect(review.completedTaskCount).toBe(14);
    expect(review.completionRate).toBe(1);
    expect(review.actualMinutes).toBeGreaterThan(0);
    expect(review.sourceDailyReviewIds).toHaveLength(7);
  });

  it("quotes past words and attaches completed-task evidence", () => {
    const praise = generateGroundedPraise(
      DEMO_USER_ID,
      weekStart,
      weekEnd,
      state.dailyReviews,
      state.tasks,
    );

    expect(praise.evidence.length).toBeGreaterThan(0);
    expect(praise.text).toContain(praise.evidence[0].quote);
    expect(praise.evidence[0].taskIds).toHaveLength(14);
  });
});
