import "server-only";

import { z } from "zod";

import { anthropic } from "@/lib/server/anthropic";
import { serverEnv } from "@/lib/server/env";
import { getGoogleAccessToken } from "@/lib/server/google-auth";
import { ExternalServiceError } from "@/lib/server/http";
import type {
  CalendarEventRecord,
  ScheduleCandidate,
} from "@/lib/server/models";

const dateTimeSchema = z.object({
  dateTime: z.string().optional(),
  date: z.string().optional(),
  timeZone: z.string().optional(),
});

const googleEventSchema = z.object({
  id: z.string(),
  summary: z.string().optional().default("(no title)"),
  description: z.string().optional(),
  location: z.string().optional(),
  status: z.string().optional().default("confirmed"),
  htmlLink: z.string().optional(),
  start: dateTimeSchema,
  end: dateTimeSchema,
});

const googleEventListSchema = z.object({
  items: z.array(googleEventSchema).optional().default([]),
});

const freeBusySchema = z.object({
  calendars: z.record(
    z.string(),
    z.object({
      busy: z
        .array(
          z.object({
            start: z.string().datetime({ offset: true }),
            end: z.string().datetime({ offset: true }),
          }),
        )
        .optional()
        .default([]),
    }),
  ),
});

export type CalendarConflict = {
  startAt: string;
  endAt: string;
};

export interface CalendarClient {
  readonly demo: boolean;
  listEvents(startAt: string, endAt: string): Promise<CalendarEventRecord[]>;
  checkConflicts(startAt: string, endAt: string): Promise<CalendarConflict[]>;
  createEvent(candidate: ScheduleCandidate): Promise<CalendarEventRecord>;
}

function normalizeEventDate(
  value: z.infer<typeof dateTimeSchema>,
  endOfDay = false,
): string {
  if (value.dateTime) {
    const date = new Date(value.dateTime);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  if (value.date) {
    const suffix = endOfDay ? "T00:00:00+09:00" : "T00:00:00+09:00";
    const date = new Date(`${value.date}${suffix}`);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  return new Date(0).toISOString();
}

function mapGoogleEvent(
  event: z.infer<typeof googleEventSchema>,
): CalendarEventRecord {
  return {
    id: event.id,
    providerEventId: event.id,
    title: event.summary,
    description: event.description,
    startAt: normalizeEventDate(event.start),
    endAt: normalizeEventDate(event.end, true),
    timezone: event.start.timeZone ?? "Asia/Tokyo",
    status: event.status,
    location: event.location,
    htmlLink: event.htmlLink,
    conflictWarning: false,
  };
}

export class GoogleCalendarRestClient implements CalendarClient {
  readonly demo = false;
  private readonly baseUrl = "https://www.googleapis.com/calendar/v3";

  constructor(
    private readonly accessToken: string,
    private readonly calendarId = serverEnv.GOOGLE_CALENDAR_ID,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
      cache: "no-store",
    });
    if (!response.ok) {
      throw new ExternalServiceError("google_calendar");
    }
    return response.json();
  }

  async listEvents(
    startAt: string,
    endAt: string,
  ): Promise<CalendarEventRecord[]> {
    const params = new URLSearchParams({
      timeMin: new Date(startAt).toISOString(),
      timeMax: new Date(endAt).toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "100",
    });
    const parsed = googleEventListSchema.safeParse(
      await this.request(
        `/calendars/${encodeURIComponent(this.calendarId)}/events?${params.toString()}`,
      ),
    );
    if (!parsed.success) {
      throw new ExternalServiceError("google_calendar");
    }
    return parsed.data.items.map(mapGoogleEvent);
  }

  async checkConflicts(
    startAt: string,
    endAt: string,
  ): Promise<CalendarConflict[]> {
    const parsed = freeBusySchema.safeParse(
      await this.request("/freeBusy", {
        method: "POST",
        body: JSON.stringify({
          timeMin: new Date(startAt).toISOString(),
          timeMax: new Date(endAt).toISOString(),
          timeZone: "Asia/Tokyo",
          items: [{ id: this.calendarId }],
        }),
      }),
    );
    if (!parsed.success) {
      throw new ExternalServiceError("google_calendar");
    }
    return (parsed.data.calendars[this.calendarId]?.busy ?? []).map((busy) => ({
      startAt: new Date(busy.start).toISOString(),
      endAt: new Date(busy.end).toISOString(),
    }));
  }

  async createEvent(candidate: ScheduleCandidate): Promise<CalendarEventRecord> {
    const parsed = googleEventSchema.safeParse(
      await this.request(
        `/calendars/${encodeURIComponent(this.calendarId)}/events`,
        {
          method: "POST",
          body: JSON.stringify({
            summary: candidate.title,
            location: candidate.location,
            start: {
              dateTime: candidate.startAt,
              timeZone: candidate.timezone,
            },
            end: {
              dateTime: candidate.endAt,
              timeZone: candidate.timezone,
            },
          }),
        },
      ),
    );
    if (!parsed.success) {
      throw new ExternalServiceError("google_calendar");
    }
    return mapGoogleEvent(parsed.data);
  }
}

const demoCreatedEvents: CalendarEventRecord[] = [];

function datePartsInTokyo(date: Date): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function demoDateAt(date: string, hour: number, minute = 0): string {
  return new Date(
    `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+09:00`,
  ).toISOString();
}

export class DemoCalendarClient implements CalendarClient {
  readonly demo = true;

  async listEvents(
    startAt: string,
    endAt: string,
  ): Promise<CalendarEventRecord[]> {
    const date = datePartsInTokyo(new Date(startAt));
    const defaults: CalendarEventRecord[] = [
      {
        id: `demo-google-event-${date}-1`,
        providerEventId: `demo-google-event-${date}-1`,
        title: "朝会",
        startAt: demoDateAt(date, 9, 30),
        endAt: demoDateAt(date, 10),
        timezone: "Asia/Tokyo",
        status: "confirmed",
        conflictWarning: false,
      },
      {
        id: `demo-google-event-${date}-2`,
        providerEventId: `demo-google-event-${date}-2`,
        title: "プロジェクト打ち合わせ",
        startAt: demoDateAt(date, 11),
        endAt: demoDateAt(date, 12),
        timezone: "Asia/Tokyo",
        status: "confirmed",
        conflictWarning: false,
      },
      {
        id: `demo-google-event-${date}-3`,
        providerEventId: `demo-google-event-${date}-3`,
        title: "レビュー",
        startAt: demoDateAt(date, 15),
        endAt: demoDateAt(date, 15, 30),
        timezone: "Asia/Tokyo",
        status: "confirmed",
        conflictWarning: false,
      },
    ];
    return [...defaults, ...demoCreatedEvents].filter(
      (event) => event.startAt < endAt && event.endAt > startAt,
    );
  }

  async checkConflicts(
    startAt: string,
    endAt: string,
  ): Promise<CalendarConflict[]> {
    const events = await this.listEvents(startAt, endAt);
    return events
      .filter((event) => event.startAt < endAt && event.endAt > startAt)
      .map((event) => ({ startAt: event.startAt, endAt: event.endAt }));
  }

  async createEvent(candidate: ScheduleCandidate): Promise<CalendarEventRecord> {
    const event: CalendarEventRecord = {
      id: `demo-google-created-${demoCreatedEvents.length + 1}`,
      providerEventId: `demo-google-created-${demoCreatedEvents.length + 1}`,
      title: candidate.title,
      startAt: new Date(candidate.startAt).toISOString(),
      endAt: new Date(candidate.endAt).toISOString(),
      timezone: candidate.timezone,
      status: "confirmed",
      location: candidate.location,
      htmlLink: "https://calendar.google.com/calendar/u/0/r",
      conflictWarning: false,
    };
    demoCreatedEvents.push(event);
    return { ...event };
  }
}

export async function createCalendarClient(
  providerAccessToken?: string,
): Promise<CalendarClient> {
  const token = await getGoogleAccessToken(providerAccessToken);
  return token
    ? new GoogleCalendarRestClient(token)
    : new DemoCalendarClient();
}

export async function extractScheduleCandidates(input: {
  subject: string;
  bodyText: string;
  referenceDate?: string;
  timezone?: string;
}) {
  return anthropic.extractScheduleCandidates({
    subject: input.subject,
    bodyText: input.bodyText,
    referenceDate: input.referenceDate ?? new Date().toISOString(),
    timezone: input.timezone ?? "Asia/Tokyo",
  });
}
