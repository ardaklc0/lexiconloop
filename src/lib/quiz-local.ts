import type { QuizQuestion } from "@/lib/api-client";
import { grammarLanguages } from "@/lib/grammar-languages";
import { withoutArticle } from "@/lib/typed-answer";
import type { WordRecord } from "@/lib/types";

// A sentence the learner wrote earlier that contained mistakes, with its AI correction.
export type ErroredSentence = { wordId: string; sentence: string; corrected: string; explanation: string };

const shuffle = <T,>(items: T[]) => [...items].sort(() => Math.random() - 0.5);

const articleChoices = (language: string) => (grammarLanguages[language]?.articles ?? "").split(",").map((item) => item.trim()).filter(Boolean);

// Questions built from the grammar data stored for the word: no AI call, so they are instant and cannot be made up.
function grammarQuestions(card: WordRecord): QuizQuestion[] {
    const forms = card.forms;
    const grammar = grammarLanguages[card.sourceLanguage];
    if (!forms || !grammar) return [];
    const questions: QuizQuestion[] = [];
    const typed = (prompt: string, answer: string | undefined, explanation: string, accepted: string[] = []) => {
        if (!answer) return;
        questions.push({ type: "typed", prompt, answer, accepted: [answer, ...accepted], hint: card.meaning || undefined, explanation, word: card.word });
    };
    if (forms.partOfSpeech === "noun") {
        const bare = withoutArticle(card.word);
        if (forms.article) {
            const choices = articleChoices(card.sourceLanguage);
            if (!choices.some((choice) => choice.toLowerCase() === forms.article!.toLowerCase())) choices.push(forms.article);
            if (choices.length >= 2) {
                questions.push({
                    type: "multiple-choice",
                    prompt: `Which article goes with “${bare}”?`,
                    options: shuffle(choices),
                    answer: forms.article,
                    explanation: `“${bare}” takes ${forms.article}${forms.gender ? ` (${forms.gender})` : ""}.`,
                    word: card.word,
                });
            }
        }
        typed(`What is the plural of “${card.word}”?`, forms.plural, `The plural is ${forms.plural}.`);
    }
    if (forms.partOfSpeech === "verb") {
        typed(`${grammar.perfect} of “${card.word}” (3rd person singular)?`, forms.perfect, `${grammar.perfect}: ${forms.perfect}.`, [forms.perfect?.split(/\s+/).pop() ?? ""]);
        typed(`${grammar.pastSimple} of “${card.word}” (3rd person singular)?`, forms.pastSimple, `${grammar.pastSimple}: ${forms.pastSimple}.`);
        typed(`Which separable prefix does “${card.word}” have?`, forms.separablePrefix, `The prefix is ${forms.separablePrefix}.`);
    }
    return questions;
}

// Up to `limit` questions that need no AI, at most one per word: grammar questions and "which sentence is correct?"
// questions built from sentences the learner got corrected before.
export function buildLocalQuestions(cards: WordRecord[], errored: ErroredSentence[], limit: number): QuizQuestion[] {
    if (limit <= 0) return [];
    const cardById = new Map(cards.map((card) => [card.id, card]));
    const candidates: QuizQuestion[] = [];
    cards.forEach((card) => {
        const options = grammarQuestions(card);
        if (options.length) candidates.push(options[Math.floor(Math.random() * options.length)]);
    });
    errored.forEach((item) => {
        const card = cardById.get(item.wordId);
        if (!card || !item.corrected || item.corrected === item.sentence) return;
        candidates.push({
            type: "multiple-choice",
            prompt: "Which sentence is correct?",
            options: shuffle([item.sentence, item.corrected]),
            answer: item.corrected,
            explanation: item.explanation || "Compare the two sentences.",
            word: card.word,
        });
    });
    const usedWords = new Set<string>();
    const picked: QuizQuestion[] = [];
    for (const question of shuffle(candidates)) {
        if (usedWords.has(question.word)) continue;
        usedWords.add(question.word);
        picked.push(question);
        if (picked.length >= limit) break;
    }
    return picked;
}
