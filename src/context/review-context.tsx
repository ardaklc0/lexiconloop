import { createContext, useCallback, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useAppData } from "@/context/app-data-context";
import { useLatestPassedDueTime } from "@/hooks/use-clock";
import { makeId } from "@/lib/ids";
import { calculateNextReview } from "@/lib/spaced-repetition";
import { saveReview } from "@/lib/supabase/data";
import type { ReviewRating, WordRecord } from "@/lib/types";
import { buildReviewQueue, defaultReviewFilters, filterReviewCards, type ReviewFilters } from "@/lib/word-filters";

type ReviewSessionEntry = { logId: string; wordId: string; rating: ReviewRating };
export type ReviewSession = { startedAt: number; entries: ReviewSessionEntry[] };

type Review = {
    filters: ReviewFilters;
    updateFilter: <K extends keyof ReviewFilters>(key: K, value: ReviewFilters[K]) => void;
    clearFilters: () => void;
    isFlipped: boolean;
    setIsFlipped: Dispatch<SetStateAction<boolean>>;
    reviewSession: ReviewSession | null;
    setReviewSession: Dispatch<SetStateAction<ReviewSession | null>>;
    showReviewSummary: boolean;
    setShowReviewSummary: Dispatch<SetStateAction<boolean>>;
    reviewCards: WordRecord[];
    queue: WordRecord[];
    currentCard: WordRecord | undefined;
    handleReview: (rating: ReviewRating) => void;
};

const ReviewContext = createContext<Review | null>(null);

export function useReview() {
    const value = useContext(ReviewContext);
    if (!value) throw new Error("useReview must be used inside ReviewProvider.");
    return value;
}

export function ReviewProvider({ children }: { children: ReactNode }) {
    const { cards, setCards, setLogs, setSyncStatus, getCloudContext, workspaceId } = useAppData();
    const [filters, setFilters] = useState<ReviewFilters>(defaultReviewFilters);
    const [isFlipped, setIsFlipped] = useState(false);
    const [reviewSession, setReviewSession] = useState<ReviewSession | null>(null);
    const [showReviewSummary, setShowReviewSummary] = useState(false);

    // Changes only when another card becomes due, not every second.
    const latestPassedDueTime = useLatestPassedDueTime(cards);
    const reviewCards = useMemo(() => filterReviewCards(cards, filters), [cards, filters]);
    const queue = useMemo(
        () => buildReviewQueue(reviewCards, filters.dueMode, filters.sort, new Date(latestPassedDueTime)),
        [filters.dueMode, filters.sort, latestPassedDueTime, reviewCards],
    );
    const currentCard = queue[0];

    useEffect(() => {
        setIsFlipped(false);
    }, [workspaceId]);

    const updateFilter = useCallback(<K extends keyof ReviewFilters>(key: K, value: ReviewFilters[K]) => {
        setFilters((previous) => ({ ...previous, [key]: value }));
    }, []);

    const clearFilters = useCallback(() => {
        setFilters(defaultReviewFilters);
        setIsFlipped(false);
    }, []);

    const handleReview = useCallback((rating: ReviewRating) => {
        if (!currentCard || !isFlipped) return;
        const reviewedAt = new Date();
        const next = calculateNextReview(currentCard, rating, reviewedAt);
        const reviewLog = { id: makeId(), wordId: currentCard.id, rating, reviewedAt: reviewedAt.toISOString() };
        setCards((previous) => previous.map((card) => card.id === currentCard.id ? { ...card, ...next } : card));
        setLogs((previous) => [...previous, reviewLog]);
        setReviewSession((session) => ({
            startedAt: session?.startedAt ?? reviewedAt.getTime(),
            entries: [...(session?.entries ?? []), { logId: reviewLog.id, wordId: currentCard.id, rating }],
        }));
        setIsFlipped(false);

        const cloud = getCloudContext();
        if (!cloud) return;
        setSyncStatus("Saving review...");
        void saveReview(cloud.client, cloud.workspaceId, currentCard, rating, next)
            .then(() => setSyncStatus("Synced"))
            .catch((error: unknown) => {
                setCards((previous) => previous.map((card) => card.id === currentCard.id ? currentCard : card));
                setLogs((previous) => previous.filter((log) => log.id !== reviewLog.id));
                setReviewSession((session) => {
                    if (!session) return null;
                    const entries = session.entries.filter((entry) => entry.logId !== reviewLog.id);
                    return entries.length ? { ...session, entries } : null;
                });
                setSyncStatus(error instanceof Error ? error.message : "Review could not be saved.");
            });
    }, [currentCard, getCloudContext, isFlipped, setCards, setLogs, setSyncStatus]);

    const value = useMemo<Review>(() => ({
        filters, updateFilter, clearFilters, isFlipped, setIsFlipped, reviewSession, setReviewSession, showReviewSummary, setShowReviewSummary,
        reviewCards, queue, currentCard, handleReview,
    }), [clearFilters, currentCard, filters, handleReview, isFlipped, queue, reviewCards, reviewSession, showReviewSummary, updateFilter]);

    return <ReviewContext.Provider value={value}>{children}</ReviewContext.Provider>;
}
