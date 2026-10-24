import { NextResponse } from "next/server";
import { asText as text, geminiErrorResponse, generateJson, requireGeminiUser } from "@/lib/server/gemini";
import { grammarLanguages } from "@/lib/grammar-languages";
import { parseForms } from "@/lib/server/forms";

export async function POST(request: Request) {
    const auth = await requireGeminiUser();
    if (auth.error) return auth.error;

    try {
        const body = await request.json() as Record<string, unknown>;
        const word = text(body.word);
        const language = text(body.sourceLanguage);
        const grammar = grammarLanguages[language];
        if (!word) return NextResponse.json({ error: "A word is required." }, { status: 400 });
        if (!grammar) return NextResponse.json({ error: `Grammar forms are not available for ${language || "this language"}.` }, { status: 400 });

        const prompt = `You are a precise ${language} grammar reference for language learners.
WORD: "${word}" (${language})${text(body.meaning) ? `\nMEANING: "${text(body.meaning)}"` : ""}

Return only valid JSON with exactly these keys:
- partOfSpeech: one of "noun", "verb", "adjective", "other".
- article: nouns only. The definite article in the singular (${grammar.articles}). Empty string otherwise.
- gender: nouns only. ${grammar.genderNote}. Empty string otherwise.
- plural: nouns only. The plural form without article, e.g. "Hunde". Empty string if the noun has no plural.
- perfect: verbs only. ${grammar.perfect}, third person singular including the auxiliary, e.g. "ist gelaufen". Empty string otherwise.
- pastSimple: verbs only. ${grammar.pastSimple}, third person singular, e.g. "lief". Empty string otherwise.
- separablePrefix: ${grammar.separablePrefix ? "verbs only. The separable prefix, e.g. \"ab\" for abfahren. Empty string if the verb is not separable." : "always an empty string."}
- inflected: array of up to 12 other surface forms that can show up in real sentences (plural, conjugated and participle forms, feminine or contracted forms), all lowercase, without articles and without WORD itself.

If WORD is a phrase or does not fit, use "other" and leave the grammar fields empty. Never invent forms: leave a field empty when you are not sure. No markdown, no extra text.`;
        const forms = parseForms(await generateJson(auth.apiKey, prompt));
        return NextResponse.json({ forms });
    } catch (error) {
        return geminiErrorResponse(error, "Could not prepare grammar forms.");
    }
}
