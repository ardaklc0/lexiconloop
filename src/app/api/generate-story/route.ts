import { NextResponse } from "next/server";
import { asText, geminiErrorResponse, generateJson, requireGeminiUser } from "@/lib/server/gemini";
import { cefrLevels } from "@/lib/constants";
import { findWordInText } from "@/lib/typed-answer";
import type { Story } from "@/lib/types";

const maxWords = 10;

export async function POST(request: Request) {
    const auth = await requireGeminiUser();
    if (auth.error) return auth.error;

    try {
        const body = await request.json() as Record<string, unknown>;
        const sourceLanguage = asText(body.sourceLanguage) || "German";
        const feedbackLanguage = asText(body.feedbackLanguage) || "English";
        const cefrLevel = cefrLevels.find((level) => level === body.cefrLevel) ?? "A2";
        const words = (Array.isArray(body.words) ? body.words : [])
            .map((item) => item as Record<string, unknown>)
            .map((item) => ({ word: asText(item.word), meaning: asText(item.meaning) }))
            .filter((item) => item.word)
            .slice(0, maxWords);
        if (words.length < 2) return NextResponse.json({ error: "At least two words are needed for a story." }, { status: 400 });

        const prompt = `You write short graded reading texts for ${sourceLanguage} learners.
LEVEL: ${cefrLevel}
TARGET WORDS (use every one of them at least once, in a form that fits the sentence):
${words.map((item) => `- ${item.word}${item.meaning ? ` (${item.meaning})` : ""}`).join("\n")}

Return only valid JSON with exactly these keys:
- title: a short title in ${sourceLanguage}.
- text: a coherent mini story or scene of 80 to 140 words in ${sourceLanguage} at LEVEL, with simple paragraphs separated by a blank line. Use all TARGET WORDS naturally. Do not add translations.
- highlights: array of { "surface", "word" } for each TARGET WORD you used. "surface" is the exact spelling as it appears in text, "word" is the TARGET WORD as listed above.
- questions: array of exactly 3 reading-comprehension questions about the text. Each is { "question", "options", "answer", "explanation" }. question and options are in ${sourceLanguage}, 3 options, "answer" is exactly one of the options, "explanation" is one short sentence in ${feedbackLanguage}.

Never put a target word in a context that changes its meaning. No markdown, no extra text.`;
        const raw = await generateJson(auth.apiKey, prompt, 0.8, "gemini-2.5-flash");

        const text = asText(raw.text);
        if (!text) return NextResponse.json({ error: "Gemini returned an empty story." }, { status: 502 });
        const known = new Map(words.map((item) => [item.word.toLocaleLowerCase(), item]));
        const highlights = (Array.isArray(raw.highlights) ? raw.highlights : [])
            .map((item) => item as Record<string, unknown>)
            .map((item) => ({ surface: asText(item.surface), word: asText(item.word) }))
            // Only words that were asked for and really appear in the text can be tapped.
            .filter((item) => known.has(item.word.toLocaleLowerCase()) && findWordInText(text, item.surface) !== null)
            .map((item) => ({ surface: item.surface, word: known.get(item.word.toLocaleLowerCase())!.word, meaning: known.get(item.word.toLocaleLowerCase())!.meaning }));
        const questions = (Array.isArray(raw.questions) ? raw.questions : [])
            .map((item) => item as Record<string, unknown>)
            .map((item) => ({
                question: asText(item.question),
                options: (Array.isArray(item.options) ? item.options : []).map(asText).filter(Boolean).slice(0, 4),
                answer: asText(item.answer),
                explanation: asText(item.explanation),
            }))
            .filter((item) => item.question && item.options.length >= 2 && item.options.includes(item.answer))
            .slice(0, 3);
        const story: Story = { title: asText(raw.title) || "Today's story", text, highlights, questions, cefrLevel, sourceLanguage };
        return NextResponse.json(story);
    } catch (error) {
        return geminiErrorResponse(error, "Could not write a story.");
    }
}
