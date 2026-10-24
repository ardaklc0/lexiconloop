import { NextResponse } from "next/server";
import { asText, geminiErrorResponse, generateJson, requireGeminiUser } from "@/lib/server/gemini";
import { cefrLevels } from "@/lib/constants";
import { findWordInText } from "@/lib/typed-answer";
import type { CefrLevel, Story, StoryFormat } from "@/lib/types";

const maxWords = 10;
// Share of the target words the text has to use, otherwise it is written once more.
const minUsedShare = 0.7;
const formats: StoryFormat[] = ["story", "dialogue", "email", "diary", "news"];

// Concrete limits keep the text at the level; "write at B1" alone is easily ignored.
const levelRules: Record<CefrLevel, string> = {
    A1: "60 to 90 words. Sentences of at most 8 words. Present tense, very common everyday vocabulary, no subordinate clauses.",
    A2: "80 to 120 words. Sentences of at most 12 words. Present and simple past, everyday vocabulary, only simple connectors (and, but, because).",
    B1: "100 to 150 words. Sentences of at most 16 words. Several tenses, some subordinate clauses, mostly familiar vocabulary.",
    B2: "120 to 170 words. Sentences of at most 22 words. Varied tenses and connectors, some idiomatic expressions.",
    C1: "130 to 190 words. Natural, varied and nuanced style with complex sentences and precise vocabulary.",
};

const formatRules: Record<StoryFormat, string> = {
    story: "A mini story or scene with a beginning and an end, in short paragraphs.",
    dialogue: 'A dialogue between two people. One line per turn, written "Name: sentence", with a blank line between turns.',
    email: "A friendly email with a greeting, a body of one or two short paragraphs, and a sign-off.",
    diary: "A diary entry written in the first person about one day.",
    news: "A short news article with a headline-style title and a neutral tone.",
};

export async function POST(request: Request) {
    const auth = await requireGeminiUser();
    if (auth.error) return auth.error;

    try {
        const body = await request.json() as Record<string, unknown>;
        const sourceLanguage = asText(body.sourceLanguage) || "German";
        const feedbackLanguage = asText(body.feedbackLanguage) || "English";
        const cefrLevel = cefrLevels.find((level) => level === body.cefrLevel) ?? "A2";
        const format = formats.find((item) => item === body.format) ?? "story";
        // The topic goes into the prompt, so it stays short and on one line.
        const topic = asText(body.topic).replace(/\s+/g, " ").slice(0, 60);
        const words = (Array.isArray(body.words) ? body.words : [])
            .map((item) => item as Record<string, unknown>)
            .map((item) => ({ word: asText(item.word), meaning: asText(item.meaning) }))
            .filter((item) => item.word)
            .slice(0, maxWords);
        if (words.length < 2) return NextResponse.json({ error: "At least two words are needed." }, { status: 400 });

        const known = new Map(words.map((item) => [item.word.toLocaleLowerCase(), item]));
        const needed = Math.ceil(words.length * minUsedShare);

        const write = async (missing: string[]) => {
            const prompt = `You write short graded reading texts for ${sourceLanguage} learners.
LEVEL: ${cefrLevel}. ${levelRules[cefrLevel]}
FORMAT: ${formatRules[format]}${topic ? `\nTOPIC: ${topic}` : ""}
TARGET WORDS (use every one of them at least once, in a form that fits the sentence):
${words.map((item) => `- ${item.word}${item.meaning ? ` (${item.meaning})` : ""}`).join("\n")}
${missing.length ? `\nYour previous text did not use these words, so this time they are required: ${missing.join(", ")}.\n` : ""}
Return only valid JSON with exactly these keys:
- title: a short title in ${sourceLanguage}.
- text: the text in ${sourceLanguage}, following LEVEL and FORMAT, using all TARGET WORDS naturally. Do not add translations or notes.
- translation: a faithful translation of the whole text into ${feedbackLanguage}, with the same line breaks.
- highlights: array of { "surface", "word" } for each TARGET WORD you used. "surface" is the exact spelling as it appears in text, "word" is the TARGET WORD as listed above.
- questions: array of exactly 3 reading-comprehension questions about the text. Each is { "question", "options", "answer", "explanation" }. question and options are in ${sourceLanguage}, 3 options, "answer" is exactly one of the options, "explanation" is one short sentence in ${feedbackLanguage}.

Never put a target word in a context that changes its meaning. No markdown, no extra text.`;
            const raw = await generateJson(auth.apiKey, prompt, 0.8, "gemini-2.5-flash");
            const text = asText(raw.text);
            if (!text) return null;
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
                    options: Array.from(new Set((Array.isArray(item.options) ? item.options : []).map(asText).filter(Boolean))).slice(0, 4),
                    answer: asText(item.answer),
                    explanation: asText(item.explanation),
                }))
                .filter((item) => item.question && item.options.length >= 2 && item.options.includes(item.answer))
                .slice(0, 3);
            const usedWords = new Set(highlights.map((item) => item.word));
            const story: Story = {
                title: asText(raw.title) || "Today's story",
                text,
                translation: asText(raw.translation) || undefined,
                format,
                topic: topic || undefined,
                createdAt: new Date().toISOString(),
                highlights,
                questions,
                cefrLevel,
                sourceLanguage,
            };
            return { story, usedWords };
        };

        let best = await write([]);
        // When too few of the words made it in, one more attempt names exactly the ones that were left out.
        if (best && best.usedWords.size < needed) {
            const retry = await write(words.map((item) => item.word).filter((word) => !best!.usedWords.has(word)));
            if (retry && retry.usedWords.size > best.usedWords.size) best = retry;
        }
        if (!best) return NextResponse.json({ error: "Gemini returned an empty text." }, { status: 502 });
        return NextResponse.json(best.story);
    } catch (error) {
        return geminiErrorResponse(error, "Could not write the text.");
    }
}
