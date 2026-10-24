import { NextResponse } from "next/server";
import { asText, geminiErrorResponse, generateJson, requireGeminiUser } from "@/lib/server/gemini";
import { cefrLevels } from "@/lib/constants";
import type { SentenceFeedback } from "@/lib/types";

const maxSentenceLength = 400;

export async function POST(request: Request) {
    const auth = await requireGeminiUser();
    if (auth.error) return auth.error;

    try {
        const body = await request.json() as Record<string, unknown>;
        const word = asText(body.word);
        const sentence = asText(body.sentence);
        const sourceLanguage = asText(body.sourceLanguage) || "German";
        const feedbackLanguage = asText(body.feedbackLanguage) || "English";
        if (!word || !sentence) return NextResponse.json({ error: "A word and a sentence are required." }, { status: 400 });
        if (sentence.length > maxSentenceLength) return NextResponse.json({ error: `Keep the sentence under ${maxSentenceLength} characters.` }, { status: 400 });

        const prompt = `You are a kind, accurate ${sourceLanguage} teacher giving feedback on a learner's sentence.
TARGET WORD: "${word}"${asText(body.meaning) ? ` (meaning: "${asText(body.meaning)}")` : ""}
LEARNER SENTENCE (${sourceLanguage}): "${sentence}"

Return only valid JSON with exactly these keys:
- corrected: the sentence rewritten correctly and naturally in ${sourceLanguage}. Keep the learner's meaning and keep TARGET WORD in it. Return the sentence unchanged if it is already correct and natural.
- isNatural: true when a native speaker would say it this way, false when it is grammatical but awkward or has errors.
- cefrLevel: one of ${cefrLevels.join(", ")}, the level of the learner's own sentence.
- errors: array (at most 5) of objects { "type", "explanation" }. type is one of "article", "case", "conjugation", "word order", "agreement", "preposition", "vocabulary", "spelling", "other". explanation is one or two short sentences in ${feedbackLanguage} naming the exact wrong part and the rule. Empty array when there are no errors.
- comment: one short encouraging sentence in ${feedbackLanguage}, including a tip when TARGET WORD was used incorrectly or not at all.

Only flag real mistakes, never invent errors. Do not return markdown or extra text.`;
        const raw = await generateJson(auth.apiKey, prompt, 0.2);

        const corrected = asText(raw.corrected);
        if (!corrected) return NextResponse.json({ error: "Gemini returned incomplete feedback." }, { status: 502 });
        const errors = (Array.isArray(raw.errors) ? raw.errors : [])
            .map((item) => item as Record<string, unknown>)
            .map((item) => ({ type: asText(item.type) || "other", explanation: asText(item.explanation) }))
            .filter((item) => item.explanation)
            .slice(0, 5);
        const feedback: SentenceFeedback = {
            corrected,
            isNatural: raw.isNatural === true && errors.length === 0,
            cefrLevel: cefrLevels.find((level) => level === raw.cefrLevel),
            errors,
            comment: asText(raw.comment) || undefined,
        };
        return NextResponse.json(feedback);
    } catch (error) {
        return geminiErrorResponse(error, "Could not check the sentence.");
    }
}
