import { sameId } from "@/lib/ids";
import { isDue, sortReviewQueue } from "@/lib/spaced-repetition";
import type { CardState, CefrLevel, Folder, WordRecord } from "@/lib/types";

export type WordReviewStatus = "all" | "overdue" | "today" | "upcoming" | "unreviewed";
export type ReviewDueMode = "due" | "all";
export type ReviewSort = "oldest-due" | "most-errors" | "random";
export type SearchField = "word" | "meaning" | "exampleSentence" | "notes";
export type WordSort = "added-newest" | "added-oldest" | "due-soonest" | "due-latest" | "status" | "folder" | "language";

export type WordFilters = {
    search: string;
    searchFields: SearchField[];
    states: CardState[];
    sourceLanguage: string;
    targetLanguage: string;
    folderId: string;
    cefrLevel: CefrLevel | "all";
    reviewStatus: WordReviewStatus;
    sort: WordSort;
};

export type ReviewFilters = {
    sourceLanguage: string;
    targetLanguage: string;
    folderId: string;
    cefrLevel: CefrLevel | "all";
    dueMode: ReviewDueMode;
    sort: ReviewSort;
};

export type QuizFilters = {
    sourceLanguage: string;
    targetLanguage: string;
    folderId: string;
    cefrLevel: CefrLevel | "all";
    cardState: CardState | "all";
};

export const allSearchFields: SearchField[] = ["word", "meaning", "exampleSentence", "notes"];

export const defaultWordFilters: WordFilters = {
    search: "",
    searchFields: allSearchFields,
    states: [],
    sourceLanguage: "all",
    targetLanguage: "all",
    folderId: "all",
    cefrLevel: "all",
    reviewStatus: "all",
    sort: "added-newest",
};

export const defaultReviewFilters: ReviewFilters = {
    sourceLanguage: "all",
    targetLanguage: "all",
    folderId: "all",
    cefrLevel: "all",
    dueMode: "due",
    sort: "oldest-due",
};

export const defaultQuizFilters: QuizFilters = {
    sourceLanguage: "all",
    targetLanguage: "all",
    folderId: "all",
    cefrLevel: "all",
    cardState: "all",
};

export const collectLanguages = (cards: WordRecord[], field: "sourceLanguage" | "targetLanguage") =>
    Array.from(new Set(cards.map((card) => card[field]).filter(Boolean))).sort();

export function filterWords(cards: WordRecord[], folders: Folder[], filters: WordFilters, dayStartTime: number) {
    const dayStart = new Date(dayStartTime);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const filtered = cards.filter((card) => {
        const searchableText = filters.searchFields.map((field) => card[field] ?? "").join(" ").toLowerCase();
        const matchesSearch = !filters.search.trim() || searchableText.includes(filters.search.toLowerCase());
        const matchesState = !filters.states.length || filters.states.includes(card.state);
        const matchesSource = filters.sourceLanguage === "all" || card.sourceLanguage === filters.sourceLanguage;
        const matchesTarget = filters.targetLanguage === "all" || card.targetLanguage === filters.targetLanguage;
        const matchesFolder = filters.folderId === "all" || (filters.folderId === "unsorted" ? !card.folderId : sameId(card.folderId, filters.folderId));
        const matchesCefr = filters.cefrLevel === "all" || card.cefrLevel === filters.cefrLevel;
        const dueTime = new Date(card.dueAt).getTime();
        const matchesReviewStatus = filters.reviewStatus === "all"
            || (filters.reviewStatus === "unreviewed" && card.reps === 0)
            || (filters.reviewStatus === "overdue" && dueTime < dayStart.getTime() && card.reps > 0)
            || (filters.reviewStatus === "today" && dueTime >= dayStart.getTime() && dueTime < dayEnd.getTime())
            || (filters.reviewStatus === "upcoming" && dueTime >= dayEnd.getTime());
        return matchesSearch && matchesState && matchesSource && matchesTarget && matchesFolder && matchesCefr && matchesReviewStatus;
    });
    const stateOrder: Record<CardState, number> = { new: 0, learning: 1, review: 2, mastered: 3 };
    const folderName = (card: WordRecord) => folders.find((folder) => sameId(folder.id, card.folderId))?.name ?? "Unsorted";
    return filtered.sort((first, second) => {
        switch (filters.sort) {
            case "added-oldest": return new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime();
            case "due-soonest": return new Date(first.dueAt).getTime() - new Date(second.dueAt).getTime();
            case "due-latest": return new Date(second.dueAt).getTime() - new Date(first.dueAt).getTime();
            case "status": return stateOrder[first.state] - stateOrder[second.state];
            case "folder": return folderName(first).localeCompare(folderName(second));
            case "language": return first.sourceLanguage.localeCompare(second.sourceLanguage) || first.targetLanguage.localeCompare(second.targetLanguage);
            case "added-newest":
            default: return new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime();
        }
    });
}

export const filterReviewCards = (cards: WordRecord[], filters: ReviewFilters) => cards.filter((card) => {
    if (filters.sourceLanguage !== "all" && card.sourceLanguage !== filters.sourceLanguage) return false;
    if (filters.targetLanguage !== "all" && card.targetLanguage !== filters.targetLanguage) return false;
    if (filters.folderId !== "all" && (filters.folderId === "unsorted" ? card.folderId : !sameId(card.folderId, filters.folderId))) return false;
    if (filters.cefrLevel !== "all" && card.cefrLevel !== filters.cefrLevel) return false;
    return true;
});

export function buildReviewQueue(reviewCards: WordRecord[], dueMode: ReviewDueMode, sort: ReviewSort, now: Date) {
    const candidates = dueMode === "due" ? reviewCards.filter((card) => isDue(card, now)) : reviewCards;
    if (sort === "random") return [...candidates].sort(() => Math.random() - 0.5);
    if (sort === "most-errors") return [...candidates].sort((first, second) => second.lapses - first.lapses || new Date(first.dueAt).getTime() - new Date(second.dueAt).getTime());
    return dueMode === "due" ? sortReviewQueue(candidates, now) : [...candidates].sort((first, second) => {
        if (first.state === "new" && second.state !== "new") return -1;
        if (first.state !== "new" && second.state === "new") return 1;
        return new Date(first.dueAt).getTime() - new Date(second.dueAt).getTime();
    });
}

export const filterQuizCards = (cards: WordRecord[], filters: QuizFilters) => cards
    .filter((card) => {
        if (filters.sourceLanguage !== "all" && card.sourceLanguage !== filters.sourceLanguage) return false;
        if (filters.targetLanguage !== "all" && card.targetLanguage !== filters.targetLanguage) return false;
        if (filters.folderId !== "all" && (filters.folderId === "unsorted" ? !card.folderId : !sameId(card.folderId, filters.folderId))) return false;
        if (filters.cefrLevel !== "all" && card.cefrLevel !== filters.cefrLevel) return false;
        if (filters.cardState !== "all" && card.state !== filters.cardState) return false;
        return true;
    })
    .sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime());
