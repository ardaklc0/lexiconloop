import { findWordInText } from "@/lib/typed-answer";
import type { Story, StoryQuestion } from "@/lib/types";

export type HighlightRange = { start: number; end: number; highlight: number };

// Every occurrence of every highlighted word, without overlaps, in text order.
export function highlightRanges(story: Story): HighlightRange[] {
    const ranges: HighlightRange[] = [];
    story.highlights.forEach((highlight, index) => {
        let offset = 0;
        for (;;) {
            const found = findWordInText(story.text.slice(offset), highlight.surface);
            if (!found) break;
            ranges.push({ start: offset + found.start, end: offset + found.end, highlight: index });
            offset += found.end;
        }
    });
    ranges.sort((first, second) => first.start - second.start);
    return ranges.filter((range, index) => index === 0 || range.start >= ranges[index - 1].end);
}

const isBoundary = (char: string) => char === "." || char === "!" || char === "?" || char === "\n";

// The sentence (or dialogue line) that contains the given range.
export function sentenceAt(text: string, start: number, end: number) {
    let from = start;
    while (from > 0 && !isBoundary(text[from - 1])) from -= 1;
    let to = end;
    while (to < text.length && !isBoundary(text[to])) to += 1;
    if (to < text.length && text[to] !== "\n") to += 1;
    return { start: from, end: to, text: text.slice(from, to).trim() };
}

export type TextPart = { text: string; word: boolean };

// Splits plain text into words and the spaces/punctuation between them, so every word can be tapped.
export function splitWords(text: string): TextPart[] {
    return text.split(/(\p{L}[\p{L}\p{N}'’-]*)/u).filter((part) => part !== "").map((part) => ({ text: part, word: /^\p{L}/u.test(part) }));
}

const shuffle = <T,>(items: T[]) => [...items].sort(() => Math.random() - 0.5);

// "Fill the gap" questions made from the story itself: no AI call. The options are the story's own target words.
export function buildGapQuestions(story: Story, count = 2): StoryQuestion[] {
    const surfaces = Array.from(new Set(story.highlights.map((item) => item.surface)));
    if (surfaces.length < 3) return [];
    const ranges = highlightRanges(story);
    const used = new Set<number>();
    const questions: StoryQuestion[] = [];
    for (const range of shuffle(ranges)) {
        if (questions.length >= count) break;
        if (used.has(range.highlight)) continue;
        const sentence = sentenceAt(story.text, range.start, range.end);
        const surface = story.text.slice(range.start, range.end);
        const raw = story.text.slice(sentence.start, sentence.end);
        const body = raw.trim();
        const gapStart = range.start - sentence.start - (raw.length - raw.trimStart().length);
        if (gapStart < 0 || body.split(/\s+/).length < 4) continue;
        used.add(range.highlight);
        const highlight = story.highlights[range.highlight];
        const others = shuffle(surfaces.filter((item) => item.toLocaleLowerCase() !== surface.toLocaleLowerCase())).slice(0, 3);
        questions.push({
            question: `${body.slice(0, gapStart)}_____${body.slice(gapStart + surface.length)}`,
            options: shuffle([surface, ...others]),
            answer: surface,
            explanation: `${highlight.word}${highlight.meaning ? `: ${highlight.meaning}` : ""}`,
        });
    }
    return questions;
}
