import type { ReviewRating, ReviewResult, WordRecord } from "@/lib/types";

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

export const formatDueIn = (dueAt: string, now = new Date()) => {
    const diff = new Date(dueAt).getTime() - now.getTime();
    if (diff <= 0) return "Due now";
    if (diff < DAY) return `In ${Math.max(1, Math.ceil(diff / MINUTE))} min`;
    const days = Math.ceil(diff / DAY);
    return `In ${days} day${days === 1 ? "" : "s"}`;
};

export const calculateNextReview = (
    card: WordRecord,
    rating: ReviewRating,
    reviewedAt = new Date(),
): ReviewResult => {
    const isFirstReview = card.reps === 0;
    const previousStability = Math.max(card.stability, 0.25);
    const nextDifficulty = rating === "know"
        ? Math.max(1, card.difficulty - 0.15)
        : Math.min(10, card.difficulty + 0.6);

    if (rating === "forgot") {
        return {
            state: "learning",
            stability: Math.max(0.25, previousStability * 0.55),
            difficulty: nextDifficulty,
            dueAt: new Date(reviewedAt.getTime() + 10 * MINUTE).toISOString(),
            lastReviewedAt: reviewedAt.toISOString(),
            reps: card.reps + 1,
            lapses: card.lapses + 1,
        };
    }

    const nextStability = isFirstReview
        ? 1
        : Math.min(365, previousStability * (1.75 - nextDifficulty * 0.045));
    const nextState = nextStability >= 21 ? "mastered" : "review";

    return {
        state: nextState,
        stability: nextStability,
        difficulty: nextDifficulty,
        dueAt: new Date(reviewedAt.getTime() + nextStability * DAY).toISOString(),
        lastReviewedAt: reviewedAt.toISOString(),
        reps: card.reps + 1,
        lapses: card.lapses,
    };
};

export const isDue = (card: WordRecord, now = new Date()) =>
    card.state === "new" || new Date(card.dueAt).getTime() <= now.getTime();

export const sortReviewQueue = (cards: WordRecord[], now = new Date()) =>
    [...cards]
        .filter((card) => isDue(card, now))
        .sort((a, b) => {
            if (a.state === "new" && b.state !== "new") return -1;
            if (a.state !== "new" && b.state === "new") return 1;
            return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
        });
