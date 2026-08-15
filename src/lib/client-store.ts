import "client-only"

import { createSeedState, seedState } from "@/lib/seed-data"
import type { AppState } from "@/lib/types"

const storageKey = "totonou.demo.state.v1"
const listeners = new Set<() => void>()
let state: AppState = seedState
let hydrated = false

function isAppState(value: unknown): value is AppState {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<AppState>
  return (
    typeof candidate.userId === "string" &&
    typeof candidate.asOfDate === "string" &&
    Array.isArray(candidate.messages) &&
    Array.isArray(candidate.tasks) &&
    Array.isArray(candidate.calendarEvents) &&
    Array.isArray(candidate.dailyReviews) &&
    Array.isArray(candidate.activityLogs) &&
    !!candidate.settings
  )
}

function emit() {
  listeners.forEach((listener) => listener())
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return
  hydrated = true
  try {
    const saved = window.localStorage.getItem(storageKey)
    if (saved) {
      const parsed: unknown = JSON.parse(saved)
      if (isAppState(parsed)) state = parsed
    }
  } catch {
    window.localStorage.removeItem(storageKey)
  }
}

function persist() {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(state))
  } catch {
    return
  }
}

export function subscribeStore(listener: () => void) {
  listeners.add(listener)
  if (!hydrated && typeof window !== "undefined") {
    queueMicrotask(() => {
      hydrate()
      emit()
    })
  }
  return () => {
    listeners.delete(listener)
  }
}

export function getStoreSnapshot() {
  return state
}

export function getServerStoreSnapshot() {
  return seedState
}

export function setStoreState(updater: (current: AppState) => AppState) {
  hydrate()
  state = updater(state)
  persist()
  emit()
}

export function resetStore() {
  state = createSeedState()
  hydrated = true
  if (typeof window !== "undefined") window.localStorage.removeItem(storageKey)
  emit()
}
