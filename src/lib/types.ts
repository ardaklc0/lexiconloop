export type CardState = "new" | "learning" | "review" | "mastered";
export type ReviewRating = "forgot" | "hard" | "good" | "easy";
export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1";

// Grammar data for languages with articles/conjugation. Everything is optional: the AI fills what applies.
export type WordForms = {
    partOfSpeech: "noun" | "verb" | "adjective" | "other";
    article?: string;
    plural?: string;
    gender?: string;
    // Compound past: Perfekt (de), passé composé (fr), pretérito perfecto (es), passato prossimo (it).
    perfect?: string;
    // Simple past: Präteritum (de), imparfait (fr), pretérito indefinido (es), imperfetto (it).
    pastSimple?: string;
    separablePrefix?: string;
    // Surface forms that can appear in sentences, used to find the word when filling gaps.
    inflected?: string[];
};

export type FamilyItem = { word: string; translation: string; category?: string };

export type WordFamily = { family: FamilyItem[]; synonyms: FamilyItem[]; antonyms: FamilyItem[] };

export type StoryQuestion = { question: string; options: string[]; answer: string; explanation: string };

export type Story = {
    title: string;
    text: string;
    highlights: Array<{ surface: string; word: string; meaning: string }>;
    questions: StoryQuestion[];
    cefrLevel: CefrLevel;
    sourceLanguage: string;
};

export type SentenceError = { type: string; explanation: string };

export type SentenceFeedback = {
    corrected: string;
    isNatural: boolean;
    cefrLevel?: CefrLevel;
    errors: SentenceError[];
    comment?: string;
};

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
    forms?: WordForms;
    wordFamily?: WordFamily;
    clozeSentences?: string[];
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
