import {
  TASK_PRIORITIES,
  TASK_TYPES,
  type CalendarEvent,
  type ISODate,
  type ISODateTime,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type TaskType,
} from "../types";

export type TaskDomainErrorCode =
  | "TASK_NOT_FOUND"
  | "TASK_NOT_STARTABLE"
  | "TASK_NOT_COMPLETABLE"
  | "TASK_ALREADY_RUNNING"
  | "MULTIPLE_RUNNING_TASKS"
  | "INVALID_TIMESTAMP"
  | "INVALID_TIME_ORDER"
  | "INVALID_DUE_DATE"
  | "INVALID_TASK_ID";

export class TaskDomainError extends Error {
  readonly code: TaskDomainErrorCode;

  constructor(code: TaskDomainErrorCode, message: string) {
    super(message);
    this.name = "TaskDomainError";
    this.code = code;
  }
}

function timestampValue(value: ISODateTime, fieldName: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new TaskDomainError(
      "INVALID_TIMESTAMP",
      `${fieldName} must be a valid ISO timestamp`,
    );
  }
  return parsed;
}

function assertISODate(value: ISODate): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TaskDomainError(
      "INVALID_DUE_DATE",
      "due date must use YYYY-MM-DD",
    );
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new TaskDomainError("INVALID_DUE_DATE", "due date is not a real date");
  }
}

function targetTask(tasks: readonly Task[], taskId: string): Task {
  const task = tasks.find((candidate) => candidate.id === taskId);
  if (!task) {
    throw new TaskDomainError("TASK_NOT_FOUND", `task ${taskId} was not found`);
  }
  return task;
}

export function calculateElapsedMinutes(
  startedAt: ISODateTime,
  completedAt: ISODateTime,
): number {
  const start = timestampValue(startedAt, "startedAt");
  const end = timestampValue(completedAt, "completedAt");
  if (end < start) {
    throw new TaskDomainError(
      "INVALID_TIME_ORDER",
      "completedAt must not be earlier than startedAt",
    );
  }
  return Math.ceil((end - start) / 60_000);
}

export function startTask(
  tasks: readonly Task[],
  taskId: string,
  startedAt: ISODateTime,
): Task[] {
  timestampValue(startedAt, "startedAt");
  const selected = targetTask(tasks, taskId);
  const runningForUser = tasks.filter(
    (task) => task.userId === selected.userId && task.status === "in_progress",
  );
  if (runningForUser.length > 1) {
    throw new TaskDomainError(
      "MULTIPLE_RUNNING_TASKS",
      "more than one task is already running for this user",
    );
  }
  if (selected.status === "in_progress") {
    return tasks.slice();
  }
  if (runningForUser.length === 1) {
    throw new TaskDomainError(
      "TASK_ALREADY_RUNNING",
      `task ${runningForUser[0].id} is already running`,
    );
  }
  if (selected.status !== "pending") {
    throw new TaskDomainError(
      "TASK_NOT_STARTABLE",
      `task ${taskId} cannot be started from ${selected.status}`,
    );
  }
  return tasks.map((task) =>
    task.id === taskId
      ? {
          ...task,
          status: "in_progress",
          startedAt,
          completedAt: null,
          elapsedMinutes: null,
          updatedAt: startedAt,
        }
      : task,
  );
}

export function completeTask(
  tasks: readonly Task[],
  taskId: string,
  completedAt: ISODateTime,
): Task[] {
  timestampValue(completedAt, "completedAt");
  const selected = targetTask(tasks, taskId);
  if (selected.status !== "in_progress" || selected.startedAt === null) {
    throw new TaskDomainError(
      "TASK_NOT_COMPLETABLE",
      `task ${taskId} must be running before completion`,
    );
  }
  const elapsedMinutes = calculateElapsedMinutes(
    selected.startedAt,
    completedAt,
  );
  return tasks.map((task) =>
    task.id === taskId
      ? {
          ...task,
          status: "completed",
          completedAt,
          elapsedMinutes,
          updatedAt: completedAt,
        }
      : task,
  );
}

export interface CarryOverResult {
  readonly original: Task;
  readonly carried: Task;
}

export function carryOverTask(
  task: Task,
  newTaskId: string,
  nextDueDate: ISODate,
  carriedAt: ISODateTime,
): CarryOverResult {
  if (!newTaskId.trim() || newTaskId === task.id) {
    throw new TaskDomainError(
      "INVALID_TASK_ID",
      "a distinct non-empty task id is required",
    );
  }
  assertISODate(nextDueDate);
  timestampValue(carriedAt, "carriedAt");
  if (nextDueDate <= task.dueDate) {
    throw new TaskDomainError(
      "INVALID_DUE_DATE",
      "carried task must have a later due date",
    );
  }
  if (task.status !== "pending" && task.status !== "in_progress") {
    throw new TaskDomainError(
      "TASK_NOT_STARTABLE",
      `task ${task.id} cannot be carried over from ${task.status}`,
    );
  }
  const original: Task = {
    ...task,
    status: "carried_over",
    updatedAt: carriedAt,
  };
  const carried: Task = {
    ...task,
    id: newTaskId,
    status: "pending",
    elapsedMinutes: null,
    startedAt: null,
    completedAt: null,
    dueDate: nextDueDate,
    carriedOverFrom: task.id,
    createdAt: carriedAt,
    updatedAt: carriedAt,
  };
  return { original, carried };
}

export function carryOverIncompleteTasks(
  tasks: readonly Task[],
  fromDate: ISODate,
  nextDueDate: ISODate,
  carriedAt: ISODateTime,
  createTaskId: (task: Task, index: number) => string,
): Task[] {
  assertISODate(fromDate);
  assertISODate(nextDueDate);
  const candidates = tasks.filter(
    (task) =>
      task.dueDate === fromDate &&
      (task.status === "pending" || task.status === "in_progress"),
  );
  const results = candidates.map((task, index) =>
    carryOverTask(task, createTaskId(task, index), nextDueDate, carriedAt),
  );
  const replacementById = new Map(
    results.map((result) => [result.original.id, result.original]),
  );
  const existingIds = new Set(tasks.map((task) => task.id));
  const carriedIds = new Set<string>();
  for (const result of results) {
    if (existingIds.has(result.carried.id) || carriedIds.has(result.carried.id)) {
      throw new TaskDomainError(
        "INVALID_TASK_ID",
        `duplicate carried task id ${result.carried.id}`,
      );
    }
    carriedIds.add(result.carried.id);
  }
  return [
    ...tasks.map((task) => replacementById.get(task.id) ?? task),
    ...results.map((result) => result.carried),
  ];
}

export type TaskGroups = Record<
  TaskPriority,
  Record<TaskType, readonly Task[]>
>;

export function groupTasksByPriorityAndType(
  tasks: readonly Task[],
  includedStatuses: readonly TaskStatus[] = ["pending", "in_progress"],
): TaskGroups {
  const included = new Set<TaskStatus>(includedStatuses);
  const groups: Record<TaskPriority, Record<TaskType, Task[]>> = {
    urgent: { sukima: [], jikkuri: [] },
    today: { sukima: [], jikkuri: [] },
    anytime: { sukima: [], jikkuri: [] },
  };
  for (const task of tasks) {
    if (included.has(task.status)) {
      groups[task.priority][task.taskType].push(task);
    }
  }
  return groups;
}

export interface TaskGroup {
  readonly priority: TaskPriority;
  readonly taskType: TaskType;
  readonly tasks: readonly Task[];
}

export function taskGroupList(groups: TaskGroups): TaskGroup[] {
  return TASK_PRIORITIES.flatMap((priority) =>
    TASK_TYPES.map((taskType) => ({
      priority,
      taskType,
      tasks: groups[priority][taskType],
    })),
  );
}

function zonedParts(timestamp: ISODateTime, timeZone: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    throw new TaskDomainError(
      "INVALID_TIMESTAMP",
      "calendar event contains an invalid timestamp",
    );
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const year = value("year");
  const month = value("month");
  const day = value("day");
  return {
    date: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    minuteOfDay: value("hour") * 60 + value("minute"),
  };
}

function eventOverlapsDate(event: CalendarEvent, date: ISODate, timeZone: string) {
  const start = zonedParts(event.startAt, timeZone);
  const end = zonedParts(event.endAt, timeZone);
  return start.date <= date && end.date >= date;
}

export function isAfternoonFree(
  events: readonly CalendarEvent[],
  date: ISODate,
  timeZone = "Asia/Tokyo",
): boolean {
  assertISODate(date);
  return !events.some((event) => {
    if (event.status === "cancelled" || !eventOverlapsDate(event, date, timeZone)) {
      return false;
    }
    if (event.allDay) {
      return true;
    }
    const start = zonedParts(event.startAt, timeZone);
    const end = zonedParts(event.endAt, timeZone);
    const startMinute = start.date < date ? 0 : start.minuteOfDay;
    const endMinute = end.date > date ? 24 * 60 : end.minuteOfDay;
    return startMinute < 24 * 60 && endMinute > 12 * 60;
  });
}

export interface ThreeSecondSummary {
  readonly date: ISODate;
  readonly eventCount: number;
  readonly replyTaskCount: number;
  readonly totalTaskCount: number;
  readonly completedTaskCount: number;
  readonly remainingTaskCount: number;
  readonly urgentTaskCount: number;
  readonly estimatedRemainingMinutes: number;
  readonly afternoonIsFree: boolean;
  readonly allTasksCompleted: boolean;
  readonly text: string;
}

export function createThreeSecondSummary(
  tasks: readonly Task[],
  events: readonly CalendarEvent[],
  date: ISODate,
  timeZone = "Asia/Tokyo",
): ThreeSecondSummary {
  assertISODate(date);
  const dayTasks = tasks.filter(
    (task) =>
      task.dueDate === date &&
      task.status !== "cancelled" &&
      task.status !== "carried_over",
  );
  const remaining = dayTasks.filter((task) => task.status !== "completed");
  const eventCount = events.filter(
    (event) =>
      event.status !== "cancelled" && eventOverlapsDate(event, date, timeZone),
  ).length;
  const replyTaskCount = remaining.filter(
    (task) => task.source === "email" && task.emailAction === "reply",
  ).length;
  const completedTaskCount = dayTasks.filter(
    (task) => task.status === "completed",
  ).length;
  const urgentTaskCount = remaining.filter(
    (task) => task.priority === "urgent",
  ).length;
  const estimatedRemainingMinutes = remaining.reduce(
    (total, task) => total + Math.max(0, task.estimatedMinutes),
    0,
  );
  const afternoonIsFree = isAfternoonFree(events, date, timeZone);
  const allTasksCompleted =
    dayTasks.length > 0 && completedTaskCount === dayTasks.length;
  const availability = afternoonIsFree
    ? "午後は空いています"
    : "午後にも予定があります";
  const completion = allTasksCompleted ? " 今日のタスクは完了です。" : "";
  return {
    date,
    eventCount,
    replyTaskCount,
    totalTaskCount: dayTasks.length,
    completedTaskCount,
    remainingTaskCount: remaining.length,
    urgentTaskCount,
    estimatedRemainingMinutes,
    afternoonIsFree,
    allTasksCompleted,
    text: `今日は予定${eventCount}件、要返信${replyTaskCount}件、タスク${remaining.length}件。${availability}。${completion}`.trim(),
  };
}

export const startTaskById = startTask;
export const completeTaskById = completeTask;
export const groupTasks = groupTasksByPriorityAndType;
export const getThreeSecondSummary = createThreeSecondSummary;
