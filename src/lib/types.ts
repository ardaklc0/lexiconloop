export type CardState = "new" | "learning" | "review" | "mastered";
export type ReviewRating = "forgot" | "hard" | "good" | "easy";
export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1";

export type WordRecord = {
    id: string;
    word: string;
    meaning: string;
    exampleSentence?: string;
    folderId: string;
    sourceLanguage: string;
    targetLanguage: string;
    cefrLevel?: CefrLevel;
    notes?: string;
    createdAt: string;
    state: CardState;
    stability: number;
    difficulty: number;
    dueAt: string;
    lastReviewedAt?: string;
    reps: number;
    lapses: number;
};

export type Folder = {
    id: string;
    name: string;
    description: string;
    color: string;
};

export type Workspace = {
    id: string;
    name: string;
};

export type ReviewLog = {
    id: string;
    wordId: string;
    rating: ReviewRating;
    reviewedAt: string;
};

export type ReviewResult = Pick<WordRecord, "state" | "stability" | "difficulty" | "dueAt" | "lastReviewedAt" | "reps" | "lapses">;
