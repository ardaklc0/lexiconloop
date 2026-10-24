import type { RecentGrammarAttempt, RecentSentenceAttempt } from "@/lib/supabase/data";
import type { ReviewLog, WordRecord } from "@/lib/types";

const DAY = 24 * 60 * 60 * 1000;

export type WeeklySummary = { headline: string; highlights: string[]; patterns: string[]; focus: string[] };

export type WeeklyStats = {
    reviews: number;
    accuracy: number | null;
    activeDays: number;
    wordsAdded: number;
    typedTotal: number;
    typedAccuracy: number | null;
    // Grammar question kind -> how often it was asked and answered wrongly.
    grammarKinds: Array<{ kind: string; asked: number; wrong: number }>;
    sentenceAttempts: number;
    sentenceErrorTypes: Array<{ type: string; count: number }>;
    hardestWords: Array<{ word: string; forgotten: number; article?: string }>;
    // Nouns missed in article/plural questions, so the AI can look for spelling patterns (-ung, -heit, ...).
    missedNouns: Array<{ word: string; article?: string; kind: string }>;
};

export const weekWindowStart = (now: Date) => new Date(now.getTime() - 7 * DAY);

// Monday of the current week as yyyy-mm-dd, the cache key of the AI summary.
export function currentWeekKey(now: Date) {
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
}

export function computeWeeklyStats(cards: WordRecord[], logs: ReviewLog[], grammar: RecentGrammarAttempt[], sentences: RecentSentenceAttempt[], now = new Date()): WeeklyStats {
    const since = weekWindowStart(now).getTime();
    const weekLogs = logs.filter((log) => new Date(log.reviewedAt).getTime() >= since);
    const cardById = new Map(cards.map((card) => [card.id, card]));

    const forgotten = new Map<string, number>();
    weekLogs.filter((log) => log.rating === "forgot").forEach((log) => forgotten.set(log.wordId, (forgotten.get(log.wordId) ?? 0) + 1));

    const kinds = new Map<string, { asked: number; wrong: number }>();
    const missed: WeeklyStats["missedNouns"] = [];
    grammar.filter((attempt) => attempt.mode === "form" && attempt.formKind).forEach((attempt) => {
        const kind = attempt.formKind!;
        const entry = kinds.get(kind) ?? { asked: 0, wrong: 0 };
        entry.asked += 1;
        if (attempt.grade === "wrong") {
            entry.wrong += 1;
            const card = cardById.get(attempt.wordId);
            if (card && (kind === "article" || kind === "plural")) missed.push({ word: card.word, article: card.forms?.article, kind });
        }
        kinds.set(kind, entry);
    });

    const errorTypes = new Map<string, number>();
    sentences.forEach((attempt) => attempt.errors.forEach((error) => errorTypes.set(error.type, (errorTypes.get(error.type) ?? 0) + 1)));

    const correctTyped = grammar.filter((attempt) => !attempt.skipped && (attempt.grade === "exact" || attempt.grade === "accent")).length;
    const activeDays = new Set(weekLogs.map((log) => new Date(log.reviewedAt).toDateString())).size;

    return {
        reviews: weekLogs.length,
        accuracy: weekLogs.length ? Math.round((weekLogs.filter((log) => log.rating !== "forgot").length / weekLogs.length) * 100) : null,
        activeDays,
        wordsAdded: cards.filter((card) => new Date(card.createdAt).getTime() >= since).length,
        typedTotal: grammar.length,
        typedAccuracy: grammar.length ? Math.round((correctTyped / grammar.length) * 100) : null,
        grammarKinds: Array.from(kinds.entries()).map(([kind, value]) => ({ kind, ...value })).sort((first, second) => second.wrong - first.wrong),
        sentenceAttempts: sentences.length,
        sentenceErrorTypes: Array.from(errorTypes.entries()).map(([type, count]) => ({ type, count })).sort((first, second) => second.count - first.count),
        hardestWords: Array.from(forgotten.entries())
            .flatMap(([wordId, count]) => {
                const card = cardById.get(wordId);
                return card ? [{ word: card.word, forgotten: count, article: card.forms?.article }] : [];
            })
            .sort((first, second) => second.forgotten - first.forgotten)
            .slice(0, 6),
        missedNouns: missed.slice(0, 12),
    };
}
