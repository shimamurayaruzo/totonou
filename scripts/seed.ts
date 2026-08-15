import { createSeedState, DEMO_USER_ID } from "../src/lib/seed-data"

const state = createSeedState("2026-08-15")
const historicalTasks = state.tasks.filter((task) => task.dueDate < state.asOfDate)
const todayTasks = state.tasks.filter((task) => task.dueDate === state.asOfDate)
const entities = [
  ...state.messages,
  ...state.tasks,
  ...state.calendarEvents,
  ...state.dailyReviews,
  ...state.activityLogs,
  state.settings,
  ...state.weeklyReviews,
  ...state.praisePosts,
]

const checks = {
  messageCount: state.messages.length === 30,
  oneWeekOfReviews: state.dailyReviews.length === 7,
  historicalTaskCount: historicalTasks.length >= 14,
  todayHasTasks: todayTasks.length >= 4,
  todayHasCalendarEvents: state.calendarEvents.length >= 3,
  oneUser: entities.every((entity) => entity.userId === DEMO_USER_ID),
  fictionalAddresses: state.messages.every(
    (message) =>
      message.from.address.endsWith(".example") &&
      message.to.every((recipient) => recipient.address.endsWith(".example")),
  ),
}

const failed = Object.entries(checks).filter(([, passed]) => !passed)
if (failed.length) {
  throw new Error(`Seed validation failed: ${failed.map(([name]) => name).join(", ")}`)
}

process.stdout.write(
  `${JSON.stringify(
    {
      valid: true,
      asOfDate: state.asOfDate,
      messages: state.messages.length,
      todayTasks: todayTasks.length,
      historicalTasks: historicalTasks.length,
      calendarEvents: state.calendarEvents.length,
      dailyReviews: state.dailyReviews.length,
      activityLogs: state.activityLogs.length,
      weeklyReviews: state.weeklyReviews.length,
      praisePosts: state.praisePosts.length,
    },
    null,
    2,
  )}\n`,
)
