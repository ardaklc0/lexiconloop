import { reviewDays } from "@/lib/kobo/days";
import { html, koboPage } from "@/lib/kobo/html";
import { loadPreferences, withKoboSession } from "@/lib/kobo/session";
import { loadUserData } from "@/lib/supabase/data";
import { buildReviewQueue } from "@/lib/word-filters";

export async function GET(request: Request) {
    return withKoboSession(request, async (session) => {
        const [{ cards, logs }, { dailyGoal, timeZone }] = await Promise.all([loadUserData(session.supabase, session.userId, session.workspace.id), loadPreferences(session)]);
        const now = new Date();
        const { todayCount, streak, week } = reviewDays(logs, timeZone, now);
        const mastered = cards.filter((card) => card.state === "mastered").length;
        const remembered = logs.filter((log) => log.rating !== "forgot").length;
        const accuracy = logs.length ? Math.round((remembered / logs.length) * 100) : 0;
        const reviewedIds = new Set(logs.map((log) => log.wordId));
        const retained = cards.filter((card) => reviewedIds.has(card.id) && card.lapses === 0).length;
        const rows: Array<[string, string | number]> = [
            ["Due now", buildReviewQueue(cards, "due", "oldest-due", now).length],
            ["Reviews today", `${todayCount} / ${dailyGoal}`],
            ["Current streak", `${streak} ${streak === 1 ? "day" : "days"}`],
            ["Total words", cards.length],
            ["Learned", `${Math.round((mastered / Math.max(cards.length, 1)) * 100)}% (${mastered})`],
            ["Accuracy", `${accuracy}%`],
            ["Retention rate", `${reviewedIds.size ? Math.round((retained / reviewedIds.size) * 100) : 0}%`],
        ];
        const dayLabel = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", day: "numeric" });

        return koboPage({
            title: "Stats",
            section: "stats",
            body: html`<h1>A little progress</h1>
                <table class="stats">${rows.map(([label, value]) => html`<tr><td>${label}</td><td class="value">${value}</td></tr>`)}</table>
                <h2>Last 7 days</h2>
                <table class="stats">${week.map((day) => html`<tr><td>${dayLabel(day.key)}</td><td class="value">${day.count >= dailyGoal ? "Goal met · " : ""}${day.count}</td></tr>`)}</table>
                <p class="muted">Your daily goal is ${dailyGoal} reviews.</p>`,
        });
    });
}
