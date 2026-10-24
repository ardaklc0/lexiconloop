import type { CefrLevel, SentenceFeedback, WordForms } from "@/lib/types";

export type QuizQuestion = {
    type: "multiple-choice" | "fill-blank";
    prompt: string;
    options?: string[];
    answer: string;
    explanation: string;
    word: string;
};

export type TranslationItem = {
    word: string;
    translation: string;
    category?: string;
};

type TranslationMistake = {
    incorrect: string;
    correct: string;
    explanation: string;
};

type TranslationCollocation = {
    phrase: string;
    translation: string;
    example: string;
};

type TranslationDialogueLine = {
    speaker: string;
    source: string;
    target: string;
};

export type TranslationResult = {
    sourceLanguage: string;
    targetLanguage: string;
    word: string;
    meaning: string;
    definition: string;
    partOfSpeech: string;
    cefrLevel: CefrLevel;
    sourceExample: string;
    targetExample: string;
    wordFamily: TranslationItem[];
    synonyms: TranslationItem[];
    antonyms: TranslationItem[];
    usage?: {
        formal?: string;
        everyday?: string;
        academic?: string;
        whenToUse?: string;
    };
    commonMistakes: TranslationMistake[];
    collocations: TranslationCollocation[];
    dialogue: TranslationDialogueLine[];
    wordForms: TranslationItem[];
    etymology: {
        rootLanguage?: string;
        root?: string;
        rootMeaning?: string;
        explanation?: string;
        confidence?: string;
    };
};

type QuizCardInput = {
    word: string;
    meaning: string;
    exampleSentence?: string;
    sourceLanguage: string;
    targetLanguage: string;
    cefrLevel?: CefrLevel;
};

async function postJson<T>(url: string, body: unknown) {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json() as T & { error?: string };
    return { ok: response.ok, data };
}

export async function requestWordDetails(input: { word: string; sourceLanguage: string; targetLanguage: string }) {
    const { ok, data } = await postJson<{ meaning?: string; sentence?: string; cefrLevel?: CefrLevel }>("/api/generate-sentence", input);
    if (!ok) throw new Error(data.error ?? "Generation failed");
    return data;
}

export async function requestQuiz(input: { questionCount: number; focusWords?: string[]; variation: string; cards: QuizCardInput[] }) {
    const { ok, data } = await postJson<{ questions?: QuizQuestion[] }>("/api/generate-quiz", input);
    if (!ok || !data.questions?.length) throw new Error(data.error ?? "Quiz generation failed");
    return data.questions;
}

export async function requestTranslation(input: { sourceLanguage: string; targetLanguage: string; word: string }) {
    const { ok, data } = await postJson<TranslationResult>("/api/generate-translation", input);
    if (!ok) throw new Error(data.error ?? "Translation failed.");
    return data;
}

export async function requestRelatedWord(input: { sourceLanguage: string; targetLanguage: string; word: string; meaning: string; relation: "synonym" | "antonym" }) {
    const { ok, data } = await postJson<{ meaning?: string; sourceExample?: string; cefrLevel?: CefrLevel }>("/api/generate-related-word", input);
    if (!ok || !data.sourceExample || !data.cefrLevel) throw new Error(data.error ?? "Could not prepare this related word.");
    return { meaning: data.meaning, sourceExample: data.sourceExample, cefrLevel: data.cefrLevel };
}

export async function requestWordForms(input: { word: string; meaning?: string; sourceLanguage: string }) {
    const { ok, data } = await postJson<{ forms?: WordForms }>("/api/enrich-word", input);
    if (!ok || !data.forms) throw new Error(data.error ?? "Could not prepare grammar forms.");
    return data.forms;
}

export async function requestSentenceFeedback(input: { word: string; meaning?: string; sentence: string; sourceLanguage: string; feedbackLanguage: string; inflected?: string[] }) {
    const { ok, data } = await postJson<SentenceFeedback>("/api/check-sentence", input);
    if (!ok || !data.corrected) throw new Error(data.error ?? "Could not check the sentence.");
    return data;
}
