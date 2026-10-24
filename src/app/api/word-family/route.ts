import { NextResponse } from "next/server";
import { asText, geminiErrorResponse, generateJson, requireGeminiUser } from "@/lib/server/gemini";
import type { FamilyItem, WordFamily } from "@/lib/types";

const readItems = (value: unknown, limit: number): FamilyItem[] => (Array.isArray(value) ? value : [])
    .map((item) => item as Record<string, unknown>)
    .map((item) => ({ word: asText(item.word), translation: asText(item.translation), category: asText(item.category) || undefined }))
    .filter((item) => item.word && item.translation)
    .slice(0, limit);

export async function POST(request: Request) {
    const auth = await requireGeminiUser();
    if (auth.error) return auth.error;

    try {
        const body = await request.json() as Record<string, unknown>;
        const word = asText(body.word);
        const sourceLanguage = asText(body.sourceLanguage) || "German";
        const targetLanguage = asText(body.targetLanguage) || "English";
        if (!word) return NextResponse.json({ error: "A word is required." }, { status: 400 });

        const prompt = `You are a ${sourceLanguage} vocabulary teacher.
WORD: "${word}"${asText(body.meaning) ? ` (meaning in ${targetLanguage}: "${asText(body.meaning)}")` : ""}

Return only valid JSON with exactly these keys, each an array of objects { "word", "translation", "category" }:
- family: up to 5 real ${sourceLanguage} words from the same root or word family (other parts of speech, derived nouns, verbs with prefixes, compounds). category is the part of speech or relation, e.g. "noun", "verb", "adjective".
- synonyms: up to 4 real ${sourceLanguage} synonyms or near-synonyms. category is empty.
- antonyms: up to 3 real ${sourceLanguage} antonyms. category is empty. Empty array when there is no real antonym.

"word" is always in ${sourceLanguage}, with the article for nouns where the language uses one. "translation" is a short translation in ${targetLanguage}. Never include WORD itself. Never invent words: leave arrays short or empty when unsure. No markdown, no extra text.`;
        const raw = await generateJson(auth.apiKey, prompt, 0.2);
        const own = word.toLocaleLowerCase();
        const notSelf = (item: FamilyItem) => item.word.toLocaleLowerCase() !== own;
        const family: WordFamily = {
            family: readItems(raw.family, 5).filter(notSelf),
            synonyms: readItems(raw.synonyms, 4).filter(notSelf),
            antonyms: readItems(raw.antonyms, 3).filter(notSelf),
        };
        return NextResponse.json({ family });
    } catch (error) {
        return geminiErrorResponse(error, "Could not find related words.");
    }
}
