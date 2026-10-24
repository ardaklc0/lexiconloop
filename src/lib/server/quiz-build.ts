import type { QuizQuestion } from "@/lib/api-client";
import { findWordInText, withoutArticle } from "@/lib/typed-answer";

export type QuizCard = {
    word?: string;
    meaning?: string;
    exampleSentence?: string;
    clozeSentences?: string[];
    inflected?: string[];
    partOfSpeech?: string;
    sourceLanguage?: string;
    targetLanguage?: string;
    cefrLevel?: string;
};

export type NamedCard = QuizCard & { word: string };

export const normalizeQuizText = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase();
export const containsQuizPhrase = (text: string, phrase: string) => {
    const normalizedPhrase = normalizeQuizText(phrase);
    return Boolean(normalizedPhrase) && findWordInText(normalizeQuizText(text), normalizedPhrase) !== null;
};

export const shuffle = <T,>(items: T[]) => [...items].sort(() => Math.random() - 0.5);
export const strings = (value: unknown) => (Array.isArray(value) ? value : []).filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());

// Wrong options come from the learner's own words: same language first, then the same part of speech, so the right
// answer is not given away by a different language or word type.
export function pickDistractors(card: NamedCard, cards: NamedCard[], stripArticles: boolean, count = 3) {
    const others = cards.filter((item) => normalizeQuizText(item.word) !== normalizeQuizText(card.word));
    const sameLanguage = others.filter((item) => !card.sourceLanguage || item.sourceLanguage === card.sourceLanguage);
    const pool = sameLanguage.length >= count ? sameLanguage : others;
    const samePartOfSpeech = card.partOfSpeech ? pool.filter((item) => item.partOfSpeech === card.partOfSpeech) : [];
    const ordered = [...shuffle(samePartOfSpeech), ...shuffle(pool.filter((item) => !samePartOfSpeech.includes(item)))];
    const seen = new Set<string>();
    const picked: string[] = [];
    for (const item of ordered) {
        const text = stripArticles ? withoutArticle(item.word) : item.word.trim();
        const key = normalizeQuizText(text);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        picked.push(text);
        if (picked.length === count) break;
    }
    return picked;
}

// The word is looked for as a whole word, in the example sentence and in the AI-written practice sentences.
// An inflected spelling (gelaufen for laufen) cannot be offered as a multiple-choice gap, so it is typed instead.
export function buildGapQuestion(card: NamedCard, cards: NamedCard[], explanation?: string): QuizQuestion | null {
    const sentences = [card.exampleSentence, ...(card.clozeSentences ?? [])].map((sentence) => sentence?.trim()).filter((sentence): sentence is string => Boolean(sentence));
    const matches = sentences.flatMap((sentence) => {
        const found = findWordInText(sentence, card.word, card.inflected);
        return found ? [{ sentence, found }] : [];
    });
    if (!matches.length) return null;
    const { sentence, found } = matches[Math.floor(Math.random() * matches.length)];
    const prompt = `${sentence.slice(0, found.start)}_____${sentence.slice(found.end)}`;
    const meaning = card.meaning?.trim();
    const baseExplanation = explanation || `${card.word}${meaning ? ` means ${meaning}` : ""}.`;
    if (found.isInflected) {
        return { type: "typed", prompt, answer: found.surface, accepted: [found.surface], hint: `${card.word}${meaning ? ` · ${meaning}` : ""}`, explanation: baseExplanation, word: card.word };
    }
    // At the start of a sentence the answer is capitalized, so the other options must be too, or they stand out.
    const surfaceHasArticle = withoutArticle(found.surface) !== found.surface.trim();
    const distractors = pickDistractors(card, cards, !surfaceHasArticle);
    if (distractors.length < 3) return null;
    return { type: "fill-blank", prompt, options: shuffle([found.surface, ...distractors.map((text) => (found.start === 0 ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text))]), answer: found.surface, explanation: baseExplanation, word: card.word };
}

// Exactly four different options, one of them the answer. Anything else cannot be answered fairly.
export function cleanOptions(options: string[], answer: string) {
    const seen = new Set<string>();
    const unique = options.filter((option) => {
        const key = normalizeQuizText(option);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    const match = unique.find((option) => normalizeQuizText(option) === normalizeQuizText(answer));
    return match && unique.length === 4 ? { options: unique, answer: match } : null;
}
