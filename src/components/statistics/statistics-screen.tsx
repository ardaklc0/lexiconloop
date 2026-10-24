import { ArrowLeft, BarChart3, FolderOpen, Languages } from "lucide-react";
import { WeeklyReview } from "@/components/statistics/weekly-review";
import { DueCount } from "@/components/ui/due-count";
import { useAppData } from "@/context/app-data-context";
import { useReview } from "@/context/review-context";
import { useToday } from "@/hooks/use-clock";
import { calculateStreak } from "@/lib/streak";
import type { WordRecord } from "@/lib/types";

type PerformanceRow = { label: string; cards: WordRecord[]; reviewed: number; accuracy: number; mastered: number };

function PerformanceRows({ rows }: { rows: PerformanceRow[] }) {
    return rows.length ? <div className="stats-table">{rows.map((row) => <div className="performance-row" key={row.label}><div><strong>{row.label}</strong><span>{row.reviewed} reviews · {row.mastered} mastered · <DueCount cards={row.cards} /> due</span></div><strong>{row.reviewed ? `${row.accuracy}%` : "—"}</strong></div>)}</div> : <p className="stats-empty">Add and review a few cards to see this breakdown.</p>;
}

export function StatisticsScreen() {
    const { cards, folders, logs, dailyGoal } = useAppData();
    const { queue } = useReview();
    // Re-render at midnight so the week, streak and estimates move to the new day.
    const today = useToday();
    const now = Date.now();
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - 6);
    const weeklyLogs = logs.filter((log) => new Date(log.reviewedAt).getTime() >= weekStart.getTime());
    const knownReviews = logs.filter((log) => log.rating !== "forgot").length;
    const accuracy = logs.length ? Math.round((knownReviews / logs.length) * 100) : 0;
    const learnedCount = cards.filter((card) => card.state === "mastered").length;
    const cardById = new Map(cards.map((card) => [card.id, card]));
    const statsForCards = (groupCards: WordRecord[]) => {
        const groupIds = new Set(groupCards.map((card) => card.id));
        const groupLogs = logs.filter((log) => groupIds.has(log.wordId));
        const remembered = groupLogs.filter((log) => log.rating !== "forgot").length;
        return {
            cards: groupCards,
            reviewed: groupLogs.length,
            accuracy: groupLogs.length ? Math.round((remembered / groupLogs.length) * 100) : 0,
            mastered: groupCards.filter((card) => card.state === "mastered").length,
        };
    };
    const languageStats = Array.from(new Set(cards.map((card) => card.sourceLanguage).filter(Boolean)))
        .sort()
        .map((label) => ({ label, ...statsForCards(cards.filter((card) => card.sourceLanguage === label)) }));
    const folderGroups = new Map<string, WordRecord[]>();
    folders.forEach((folder) => folderGroups.set(folder.id, []));
    cards.forEach((card) => {
        const groupId = card.folderId || "unsorted";
        folderGroups.set(groupId, [...(folderGroups.get(groupId) ?? []), card]);
    });
    const folderStats = Array.from(folderGroups.entries())
        .map(([groupId, groupCards]) => ({
            label: groupId === "unsorted" ? "Unsorted" : folders.find((folder) => folder.id === groupId)?.name ?? "Unsorted",
            ...statsForCards(groupCards),
        }))
        .sort((first, second) => first.label.localeCompare(second.label));
    const forgottenCounts = new Map<string, number>();
    logs.filter((log) => log.rating === "forgot").forEach((log) => forgottenCounts.set(log.wordId, (forgottenCounts.get(log.wordId) ?? 0) + 1));
    const forgottenWords = Array.from(forgottenCounts.entries())
        .flatMap(([wordId, count]) => {
            const card = cardById.get(wordId);
            return card ? [{ card, count }] : [];
        })
        .sort((first, second) => second.count - first.count)
        .slice(0, 6);
    const reviewedCardIds = new Set(logs.map((log) => log.wordId));
    const retainedCards = cards.filter((card) => reviewedCardIds.has(card.id) && card.lapses === 0);
    const retentionRate = reviewedCardIds.size ? Math.round((retainedCards.length / reviewedCardIds.size) * 100) : 0;
    const recentStart = new Date(now);
    recentStart.setDate(recentStart.getDate() - 29);
    const recentKnownLogs = logs.filter((log) => log.rating !== "forgot" && new Date(log.reviewedAt).getTime() >= recentStart.getTime());
    const activeRecentDays = new Set(recentKnownLogs.map((log) => new Date(log.reviewedAt).toDateString())).size;
    const successfulReviewsPerDay = recentKnownLogs.length / Math.max(activeRecentDays, 1);
    const unfinishedCount = cards.filter((card) => card.state !== "mastered").length;
    const estimatedMasteryDays = unfinishedCount && recentKnownLogs.length
        ? Math.ceil(unfinishedCount / Math.max(successfulReviewsPerDay, 0.25))
        : 0;
    const estimatedMastery = unfinishedCount === 0
        ? "Complete"
        : estimatedMasteryDays
            ? new Date(now + estimatedMasteryDays * 86_400_000).toLocaleDateString("en-US", { month: "short", day: "numeric" })
            : "Not enough data";
    const dayBuckets = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + index);
        const count = weeklyLogs.filter((log) => new Date(log.reviewedAt).toDateString() === date.toDateString()).length;
        return { date, count: Math.min(count, dailyGoal), goalMet: count >= dailyGoal };
    });
    const maxReviews = dailyGoal;
    const stats = [
        { label: "Total words", value: cards.length, detail: "Words in your library" },
        { label: "Learned", value: `${Math.round((learnedCount / Math.max(cards.length, 1)) * 100)}%`, detail: `${learnedCount} mastered cards` },
        { label: "Reviews this week", value: weeklyLogs.length, detail: `${dayBuckets.filter((day) => day.goalMet).length} of 7 days met your goal` },
        { label: "Accuracy", value: `${accuracy}%`, detail: `${knownReviews} remembered · ${logs.length - knownReviews} forgotten` },
        { label: "Retention rate", value: `${retentionRate}%`, detail: `${retainedCards.length} cards without a recorded lapse` },
        { label: "Estimated mastery", value: estimatedMastery, detail: unfinishedCount ? `${unfinishedCount} cards still in progress` : "Every card is mastered", compact: true },
    ];
    return <><div className="stats-grid">{stats.map((stat) => <div className="big-stat" key={stat.label}><small>{stat.label}</small><strong className={stat.compact ? "compact-stat" : undefined}>{stat.value}</strong><span className="stat-detail">{stat.detail}</span></div>)}</div><div className="stats-detail-grid"><section className="surface-panel"><div className="panel-heading"><div><h2>Reviews this week</h2><p className="panel-subtitle">Your practice by day</p></div><span className="mono-label">Last 7 days</span></div><div className="bar-chart">{dayBuckets.map((day, index) => <div className="bar-column" key={day.date.toISOString()}><div className={`bar ${index === 6 ? "today" : ""}`} style={{ height: `${Math.max(day.count ? 12 : 3, (day.count / maxReviews) * 100)}%` }} /><span>{day.date.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 1)}</span></div>)}</div></section><section className="surface-panel stats-explanation"><div className="panel-heading"><div><h2>What this means</h2><p className="panel-subtitle">A quick read of your progress</p></div><BarChart3 size={17} color="var(--sage)" /></div><div className="stat-row"><span className="stat-label"><span className="dot-icon dot-sage" />Due now</span><strong className="stat-value">{queue.length}</strong></div><div className="stat-row"><span className="stat-label"><span className="dot-icon dot-peach" />Current streak</span><strong className="stat-value">{calculateStreak(logs, new Date(today))} days</strong></div><p className="stats-note">Retention counts cards you have reviewed without a recorded lapse. Mastery is estimated from your recent successful-review pace.</p></section></div><WeeklyReview /><div className="stats-breakdown-grid"><section className="surface-panel"><div className="panel-heading"><div><h2>By language</h2><p className="panel-subtitle">Accuracy by source language</p></div><Languages size={17} color="var(--sage)" /></div><PerformanceRows rows={languageStats} /></section><section className="surface-panel"><div className="panel-heading"><div><h2>By folder</h2><p className="panel-subtitle">Accuracy by collection</p></div><FolderOpen size={17} color="var(--sage)" /></div><PerformanceRows rows={folderStats} /></section><section className="surface-panel"><div className="panel-heading"><div><h2>Most forgotten</h2><p className="panel-subtitle">Words that need another pass</p></div><ArrowLeft size={17} color="var(--red)" /></div>{forgottenWords.length ? <div className="stats-table">{forgottenWords.map(({ card, count }) => <div className="performance-row" key={card.id}><div><strong>{card.word}</strong><span>{card.meaning || "Meaning to be added"}</span></div><strong>{count}x</strong></div>)}</div> : <p className="stats-empty">No forgotten reviews yet. Keep going.</p>}</section></div></>;
}
