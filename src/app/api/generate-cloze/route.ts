import { NextResponse } from "next/server";
import { asText, geminiErrorResponse, generateJson, requireGeminiUser } from "@/lib/server/gemini";
import { findWordInText } from "@/lib/typed-answer";

export async function POST(request: Request) {
    const auth = await requireGeminiUser();
    if (auth.error) return auth.error;

    try {
        const body = await request.json() as Record<string, unknown>;
        const word = asText(body.word);
        const sourceLanguage = asText(body.sourceLanguage) || "German";
        const inflected = Array.isArray(body.inflected) ? body.inflected.map(asText).filter(Boolean) : [];
        if (!word) return NextResponse.json({ error: "A word is required." }, { status: 400 });

        const prompt = `You write fill-in-the-gap practice sentences for ${sourceLanguage} learners.
WORD: "${word}"${asText(body.meaning) ? ` (meaning: "${asText(body.meaning)}")` : ""}${asText(body.cefrLevel) ? `\nLEVEL: ${asText(body.cefrLevel)}` : ""}

Return only valid JSON: { "sentences": [ ... ] } with exactly 3 different natural ${sourceLanguage} sentences, each 5 to 12 words, at the learner's level.
- Every sentence must contain WORD itself or one correct inflected form of it (plural, conjugated, participle or case form), written in ${sourceLanguage}.
- Each sentence must make the meaning of WORD clear from context, so the gap can be guessed.
- No translations, no quotation marks around WORD, no markdown, no extra text.`;
        const raw = await generateJson(auth.apiKey, prompt, 0.7);

        // A sentence is only kept when the word really appears in it, otherwise the gap could not be built.
        const sentences = (Array.isArray(raw.sentences) ? raw.sentences : [])
            .map(asText)
            .filter((sentence) => sentence.length <= 200 && findWordInText(sentence, word, inflected) !== null);
        const unique = Array.from(new Set(sentences)).slice(0, 3);
        if (!unique.length) return NextResponse.json({ error: "Gemini did not return usable sentences." }, { status: 502 });
        return NextResponse.json({ sentences: unique });
    } catch (error) {
        return geminiErrorResponse(error, "Could not prepare practice sentences.");
    }
}
