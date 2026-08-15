import { describe, expect, it } from "vitest";

import type { CalendarEvent, Task } from "../types";
import {
  calculateElapsedMinutes,
  carryOverIncompleteTasks,
  carryOverTask,
  completeTask,
  createThreeSecondSummary,
  groupTasksByPriorityAndType,
  startTask,
} from "./tasks";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    userId: "user-1",
    source: "manual",
    messageId: null,
    calendarEventId: null,
    emailAction: null,
    title: "確認する",
    notes: "",
    priority: "today",
    taskType: "sukima",
    status: "pending",
    estimatedMinutes: 15,
    elapsedMinutes: null,
    startedAt: null,
    completedAt: null,
    dueDate: "2026-08-15",
    carriedOverFrom: null,
    createdAt: "2026-08-14T23:00:00.000Z",
    updatedAt: "2026-08-14T23:00:00.000Z",
    ...overrides,
  };
}

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "event-1",
    externalId: "external-1",
    userId: "user-1",
    account: "gmail",
    title: "予定",
    description: "",
    location: "オンライン",
    startAt: "2026-08-15T00:00:00.000Z",
    endAt: "2026-08-15T00:30:00.000Z",
    allDay: false,
    status: "confirmed",
    sourceUrl: "https://calendar.google.com/calendar/event?eid=demo",
    createdAt: "2026-08-14T00:00:00.000Z",
    updatedAt: "2026-08-14T00:00:00.000Z",
    ...overrides,
  };
}

describe("startTask", () => {
  it("starts one task immutably and keeps only one running task per user", () => {
    const tasks = [makeTask(), makeTask({ id: "task-2" })];
    const before = JSON.stringify(tasks);
    const result = startTask(tasks, "task-1", "2026-08-15T00:05:00.000Z");

    expect(result[0]).toMatchObject({
      status: "in_progress",
      startedAt: "2026-08-15T00:05:00.000Z",
    });
    expect(result.filter((task) => task.status === "in_progress")).toHaveLength(1);
    expect(JSON.stringify(tasks)).toBe(before);
    expect(() =>
      startTask(result, "task-2", "2026-08-15T00:06:00.000Z"),
    ).toThrowError(
      expect.objectContaining({ code: "TASK_ALREADY_RUNNING" }),
    );
  });

  it("allows different users to run one task each and rejects a broken invariant", () => {
    const otherUserRunning = makeTask({
      id: "other-running",
      userId: "user-2",
      status: "in_progress",
      startedAt: "2026-08-15T00:00:00.000Z",
    });
    const result = startTask(
      [makeTask(), otherUserRunning],
      "task-1",
      "2026-08-15T00:05:00.000Z",
    );
    expect(result.filter((task) => task.status === "in_progress")).toHaveLength(2);

    const broken = [
      makeTask({
        id: "running-1",
        status: "in_progress",
        startedAt: "2026-08-15T00:00:00.000Z",
      }),
      makeTask({
        id: "running-2",
        status: "in_progress",
        startedAt: "2026-08-15T00:01:00.000Z",
      }),
      makeTask({ id: "pending" }),
    ];
    expect(() =>
      startTask(broken, "pending", "2026-08-15T00:05:00.000Z"),
    ).toThrowError(
      expect.objectContaining({ code: "MULTIPLE_RUNNING_TASKS" }),
    );
  });
});

describe("task completion", () => {
  it("rounds any partial minute up and records elapsed minutes", () => {
    expect(
      calculateElapsedMinutes(
        "2026-08-15T00:00:00.000Z",
        "2026-08-15T00:01:01.000Z",
      ),
    ).toBe(2);
    expect(
      calculateElapsedMinutes(
        "2026-08-15T00:00:00.000Z",
        "2026-08-15T00:00:00.000Z",
      ),
    ).toBe(0);

    const result = completeTask(
      [
        makeTask({
          status: "in_progress",
          startedAt: "2026-08-15T00:00:00.000Z",
        }),
      ],
      "task-1",
      "2026-08-15T00:01:01.000Z",
    );
    expect(result[0]).toMatchObject({
      status: "completed",
      completedAt: "2026-08-15T00:01:01.000Z",
      elapsedMinutes: 2,
    });
  });

  it("rejects completion before start and completion of a pending task", () => {
    expect(() =>
      calculateElapsedMinutes(
        "2026-08-15T00:02:00.000Z",
        "2026-08-15T00:01:00.000Z",
      ),
    ).toThrowError(
      expect.objectContaining({ code: "INVALID_TIME_ORDER" }),
    );
    expect(() =>
      completeTask([makeTask()], "task-1", "2026-08-15T00:01:00.000Z"),
    ).toThrowError(
      expect.objectContaining({ code: "TASK_NOT_COMPLETABLE" }),
    );
  });
});

describe("carry over", () => {
  it("closes the original and creates a reset pending task for the next date", () => {
    const original = makeTask({
      source: "email",
      messageId: "message-1",
      emailAction: "reply",
      status: "in_progress",
      startedAt: "2026-08-15T00:00:00.000Z",
    });
    const result = carryOverTask(
      original,
      "task-2",
      "2026-08-16",
      "2026-08-15T14:00:00.000Z",
    );

    expect(result.original.status).toBe("carried_over");
    expect(result.carried).toMatchObject({
      id: "task-2",
      status: "pending",
      messageId: "message-1",
      startedAt: null,
      completedAt: null,
      elapsedMinutes: null,
      dueDate: "2026-08-16",
      carriedOverFrom: "task-1",
    });
    expect(original.status).toBe("in_progress");
  });

  it("carries only incomplete tasks and requires unique generated ids", () => {
    const tasks = [
      makeTask(),
      makeTask({ id: "done", status: "completed", elapsedMinutes: 10 }),
      makeTask({ id: "future", dueDate: "2026-08-16" }),
    ];
    const result = carryOverIncompleteTasks(
      tasks,
      "2026-08-15",
      "2026-08-16",
      "2026-08-15T15:00:00.000Z",
      (task) => `${task.id}-next`,
    );
    expect(result).toHaveLength(4);
    expect(result.find((task) => task.id === "task-1")?.status).toBe(
      "carried_over",
    );
    expect(result.find((task) => task.id === "task-1-next")?.status).toBe(
      "pending",
    );

    expect(() =>
      carryOverIncompleteTasks(
        [makeTask(), makeTask({ id: "second" })],
        "2026-08-15",
        "2026-08-16",
        "2026-08-15T15:00:00.000Z",
        () => "same-id",
      ),
    ).toThrowError(
      expect.objectContaining({ code: "INVALID_TASK_ID" }),
    );
  });
});

describe("grouping and summary", () => {
  it("builds all priority by type buckets and excludes finished tasks by default", () => {
    const groups = groupTasksByPriorityAndType([
      makeTask({ priority: "urgent", taskType: "sukima" }),
      makeTask({ id: "deep", priority: "today", taskType: "jikkuri" }),
      makeTask({ id: "done", status: "completed" }),
    ]);

    expect(groups.urgent.sukima.map((task) => task.id)).toEqual(["task-1"]);
    expect(groups.today.jikkuri.map((task) => task.id)).toEqual(["deep"]);
    expect(groups.anytime.sukima).toEqual([]);
    expect(groups.today.sukima).toEqual([]);
  });

  it("counts today's remaining replies and detects a free afternoon boundary", () => {
    const tasks = [
      makeTask({ source: "email", emailAction: "reply", priority: "urgent" }),
      makeTask({
        id: "reply-done",
        source: "email",
        emailAction: "reply",
        status: "completed",
        elapsedMinutes: 5,
      }),
      makeTask({ id: "manual", estimatedMinutes: 30 }),
      makeTask({ id: "tomorrow", dueDate: "2026-08-16" }),
    ];
    const morningEvents = [
      makeEvent(),
      makeEvent({
        id: "event-2",
        startAt: "2026-08-15T01:00:00.000Z",
        endAt: "2026-08-15T02:00:00.000Z",
      }),
      makeEvent({
        id: "event-3",
        startAt: "2026-08-15T02:30:00.000Z",
        endAt: "2026-08-15T03:00:00.000Z",
      }),
    ];
    const summary = createThreeSecondSummary(
      tasks,
      morningEvents,
      "2026-08-15",
    );

    expect(summary).toMatchObject({
      eventCount: 3,
      replyTaskCount: 1,
      totalTaskCount: 3,
      completedTaskCount: 1,
      remainingTaskCount: 2,
      urgentTaskCount: 1,
      afternoonIsFree: true,
      allTasksCompleted: false,
    });
    expect(summary.text).toContain("予定3件、要返信1件、タスク2件");
    expect(summary.text).toContain("午後は空いています");

    const busy = createThreeSecondSummary(
      tasks,
      [
        ...morningEvents,
        makeEvent({
          id: "event-afternoon",
          startAt: "2026-08-15T06:00:00.000Z",
          endAt: "2026-08-15T06:30:00.000Z",
        }),
      ],
      "2026-08-15",
    );
    expect(busy.afternoonIsFree).toBe(false);
  });

  it("does not call an empty task list completed", () => {
    expect(
      createThreeSecondSummary([], [], "2026-08-15").allTasksCompleted,
    ).toBe(false);
  });
});
