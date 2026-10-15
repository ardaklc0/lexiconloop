import type { ReviewLog } from "@/lib/types";

// Kobo pages render on the server, so "today" must be computed in the user's
// time zone rather than the server's.

const formatters = new Map<string, Intl.DateTimeFormat>();

const dayFormatter = (timeZone: string) => {
    let formatter = formatters.get(timeZone);
    if (!formatter) {
        try {
            formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
        } catch {
            formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" });
        }
        formatters.set(timeZone, formatter);
    }
    return formatter;
};

/** Calendar day in the given zone, as YYYY-MM-DD. */
export const dayKey = (date: Date | string, timeZone: string) => dayFormatter(timeZone).format(new Date(date));

const shiftDay = (key: string, days: number) => {
    const date = new Date(`${key}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
};

export function reviewDays(logs: ReviewLog[], timeZone: string, now = new Date()) {
    const countsByDay = new Map<string, number>();
    logs.forEach((log) => {
        const key = dayKey(log.reviewedAt, timeZone);
        countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1);
    });
    const today = dayKey(now, timeZone);
    let cursor = countsByDay.has(today) ? today : shiftDay(today, -1);
    let streak = 0;
    while (countsByDay.has(cursor)) {
        streak += 1;
        cursor = shiftDay(cursor, -1);
    }
    return {
        todayCount: countsByDay.get(today) ?? 0,
        streak,
        /** The last seven days, oldest first, with the number of reviews on each. */
        week: Array.from({ length: 7 }, (_, index) => {
            const key = shiftDay(today, index - 6);
            return { key, count: countsByDay.get(key) ?? 0 };
        }),
    };
}

export const formatDay = (date: string, timeZone: string) => {
    const { timeZone: zone } = dayFormatter(timeZone).resolvedOptions();
    return new Date(date).toLocaleDateString("en-US", { timeZone: zone, day: "numeric", month: "short", year: "numeric" });
};
