import type { ReviewLog } from "@/lib/types";

export const calculateStreak = (logs: ReviewLog[], now = new Date()) => {
    const reviewedDays = new Set(logs.map((log) => {
        const date = new Date(log.reviewedAt);
        return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    }));
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayKey = today.getTime();
    const yesterdayKey = new Date(today.getTime() - 86_400_000).getTime();
    if (!reviewedDays.has(todayKey) && !reviewedDays.has(yesterdayKey)) return 0;

    let streak = 0;
    let cursor = reviewedDays.has(todayKey) ? today : new Date(today.getTime() - 86_400_000);
    while (reviewedDays.has(cursor.getTime())) {
        streak += 1;
        cursor = new Date(cursor.getTime() - 86_400_000);
    }
    return streak;
};

export const getTodayLogs = (logs: ReviewLog[], now = new Date()) =>
    logs.filter((log) => new Date(log.reviewedAt).toDateString() === now.toDateString());
