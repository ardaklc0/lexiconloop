import { NextResponse } from "next/server";
import { asText, geminiErrorResponse, generateJson, requireGeminiUser } from "@/lib/server/gemini";
import { cefrLevels } from "@/lib/constants";
import { findWordInText } from "@/lib/typed-answer";
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
        // Known inflected forms of the word. Only present when the word's grammar data has been prepared.
        const inflected = Array.isArray(body.inflected) ? body.inflected.map(asText).filter(Boolean) : null;
        if (!word || !sentence) return NextResponse.json({ error: "A word and a sentence are required." }, { status: 400 });
        if (sentence.length > maxSentenceLength) return NextResponse.json({ error: `Keep the sentence under ${maxSentenceLength} characters.` }, { status: 400 });
        if (sentence.split(/\s+/).length < 2) return NextResponse.json({ error: "Write a full sentence, not just a word." }, { status: 400 });

        // With known forms the word check is exact; without them the model has to decide.
        const knownUse = inflected && inflected.length ? findWordInText(sentence, word, inflected) !== null : null;
        if (knownUse === false) {
            return NextResponse.json({
                corrected: sentence,
                isNatural: false,
                errors: [{ type: "vocabulary", explanation: `The sentence does not contain “${word}” or a form of it.` }],
                comment: `Try again with “${word}” in your sentence.`,
            } satisfies SentenceFeedback);
        }

        const prompt = `You are a careful, accurate ${sourceLanguage} teacher giving feedback on a learner's sentence.
TARGET WORD: "${word}"${asText(body.meaning) ? ` (meaning: "${asText(body.meaning)}")` : ""}
LEARNER SENTENCE (${sourceLanguage}): "${sentence}"

Judge exactly the sentence above, nothing else. Return only valid JSON with exactly these keys:
- usesTargetWord: true only when the learner's sentence contains TARGET WORD or a correct inflected form of it (plural, conjugated, participle, case ending). false otherwise.
- corrected: the learner's sentence with only the real mistakes fixed. Copy everything that is already correct unchanged: do not change number, tense, word choice or style, and do not force TARGET WORD into its dictionary form: plural, conjugated and inflected forms are correct when the grammar needs them. If there are no mistakes, return the learner's sentence unchanged.
- isNatural: true only when the learner's sentence is a complete, grammatical sentence a native speaker would say. A fragment, a single word, a sentence with an error, or a sentence that does not use TARGET WORD is not natural.
- cefrLevel: one of ${cefrLevels.join(", ")}, the level of the learner's own sentence.
- errors: array (at most 5) of { "type", "explanation" }. type is one of "article", "case", "conjugation", "word order", "agreement", "preposition", "vocabulary", "spelling", "other". explanation is one or two short sentences in ${feedbackLanguage} naming the exact wrong part and the rule. Empty array when the sentence has no mistakes.
- comment: one short sentence in ${feedbackLanguage}. If the learner did not use TARGET WORD, say so. Never praise a sentence that has errors.

Only flag real mistakes and never invent errors. Do not return markdown or extra text.`;
        const raw = await generateJson(auth.apiKey, prompt, 0.1, "gemini-2.5-flash");

        const used = knownUse ?? raw.usesTargetWord === true;
        const errors = (Array.isArray(raw.errors) ? raw.errors : [])
            .map((item) => item as Record<string, unknown>)
            .map((item) => ({ type: asText(item.type) || "other", explanation: asText(item.explanation) }))
            .filter((item) => item.explanation)
            .slice(0, 5);
        if (!used) {
            errors.unshift({ type: "vocabulary", explanation: `The sentence does not contain “${word}” or a form of it.` });
        }
        const isNatural = raw.isNatural === true && errors.length === 0;
        // Without reported mistakes the learner's sentence stays as written, so a made-up "correction" never shows.
        const corrected = errors.length === 0 && isNatural ? sentence : asText(raw.corrected) || sentence;
        const feedback: SentenceFeedback = {
            corrected,
            isNatural,
            cefrLevel: cefrLevels.find((level) => level === raw.cefrLevel),
            errors: errors.slice(0, 5),
            comment: asText(raw.comment) || undefined,
        };
        return NextResponse.json(feedback);
    } catch (error) {
        return geminiErrorResponse(error, "Could not check the sentence.");
    }
}
