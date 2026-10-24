import type { CefrLevel, ReviewLog, WordRecord } from "@/lib/types";

const DAY = 24 * 60 * 60 * 1000;
const minWords = 3;
const maxWords = 8;

export type StoryWordGroup = {
    sourceLanguage: string;
    targetLanguage: string;
    cefrLevel: CefrLevel;
    words: WordRecord[];
};

const mostCommon = <T,>(values: T[]) => {
    const counts = new Map<T, number>();
    values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
    return Array.from(counts.entries()).sort((first, second) => second[1] - first[1])[0]?.[0];
};

// Words reviewed in the last 7 days, grouped by language: the ones forgotten most come first, since a story is a second look at them.
// A language with only a few reviewed words this week is topped up with its most recently reviewed older words.
export function pickStoryWordGroups(cards: WordRecord[], logs: ReviewLog[], now = new Date()): StoryWordGroup[] {
    const weekAgo = now.getTime() - 7 * DAY;
    const reviewedThisWeek = new Set(logs.filter((log) => new Date(log.reviewedAt).getTime() >= weekAgo).map((log) => log.wordId));
    const reviewable = cards.filter((card) => card.reps > 0 && card.meaning.trim());
    const byLanguage = new Map<string, WordRecord[]>();
    reviewable.forEach((card) => byLanguage.set(card.sourceLanguage, [...(byLanguage.get(card.sourceLanguage) ?? []), card]));

    return Array.from(byLanguage.entries()).flatMap(([sourceLanguage, languageCards]) => {
        const lastReview = (card: WordRecord) => new Date(card.lastReviewedAt ?? card.createdAt).getTime();
        const recent = languageCards.filter((card) => reviewedThisWeek.has(card.id));
        const older = languageCards.filter((card) => !reviewedThisWeek.has(card.id)).sort((first, second) => lastReview(second) - lastReview(first));
        const chosen = [...recent.sort((first, second) => second.lapses - first.lapses || lastReview(second) - lastReview(first)), ...older].slice(0, maxWords);
        if (chosen.length < minWords) return [];
        return [{
            sourceLanguage,
            targetLanguage: mostCommon(chosen.map((card) => card.targetLanguage)) ?? "English",
            cefrLevel: mostCommon(chosen.flatMap((card) => (card.cefrLevel ? [card.cefrLevel] : []))) ?? "A2",
            words: chosen,
        }];
    }).sort((first, second) => second.words.length - first.words.length);
}
