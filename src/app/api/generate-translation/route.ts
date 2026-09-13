import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type LanguageItem = {
    word?: string;
    translation?: string;
    category?: string;
};

type TranslationResult = {
    sourceLanguage?: string;
    targetLanguage?: string;
    word?: string;
    meaning?: string;
    definition?: string;
    partOfSpeech?: string;
    sourceExample?: string;
    targetExample?: string;
    wordFamily?: LanguageItem[];
    synonyms?: LanguageItem[];
    antonyms?: LanguageItem[];
    etymology?: {
        rootLanguage?: string;
        root?: string;
        rootMeaning?: string;
        explanation?: string;
        confidence?: string;
    };
};

const asText = (value: unknown) => typeof value === "string" ? value.trim() : "";
const asItems = (value: unknown) => Array.isArray(value)
    ? value.map((item): LanguageItem | null => {
        if (!item || typeof item !== "object") return null;
        const candidate = item as LanguageItem;
        const word = asText(candidate.word);
        const translation = asText(candidate.translation);
        if (!word || !translation) return null;
        return { word, translation, category: asText(candidate.category) || undefined };
    }).filter((item): item is LanguageItem => item !== null).slice(0, 12)
    : [];

export async function POST(request: Request) {
    const supabase = await createSupabaseServerClient();
    if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GEMINI_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ error: "Gemini is not configured yet." }, { status: 503 });

    try {
        const body = await request.json() as { sourceLanguage?: string; targetLanguage?: string; word?: string };
        const sourceLanguage = asText(body.sourceLanguage) || "German";
        const targetLanguage = asText(body.targetLanguage) || "English";
        const word = asText(body.word);
        if (!word) return NextResponse.json({ error: "A word is required." }, { status: 400 });

        const client = new GoogleGenerativeAI(apiKey);
        const model = client.getGenerativeModel({
            model: "gemini-2.5-flash",
            generationConfig: { responseMimeType: "application/json", temperature: 0.25 },
        });
        const prompt = `You are a precise language-learning assistant.
SOURCE LANGUAGE: ${sourceLanguage}
TARGET LANGUAGE: ${targetLanguage}
WORD: "${word}"

Analyze the word for a learner. Return only valid JSON with exactly this shape:
{"sourceLanguage":"...","targetLanguage":"...","word":"...","meaning":"...","definition":"...","partOfSpeech":"...","sourceExample":"...","targetExample":"...","wordFamily":[{"word":"...","translation":"...","category":"..."}],"synonyms":[{"word":"...","translation":"...","category":"..."}],"antonyms":[{"word":"...","translation":"...","category":"..."}],"etymology":{"rootLanguage":"...","root":"...","rootMeaning":"...","explanation":"...","confidence":"high|medium|low|unknown"}}

Rules:
- meaning, definition, translations, and targetExample must be written only in TARGET LANGUAGE.
- sourceExample must be written only in SOURCE LANGUAGE and naturally use WORD.
- wordFamily must contain related words from SOURCE LANGUAGE, not random translations or unrelated words. Include forms such as derived nouns, adjectives, or close morphological relatives when they exist.
- synonyms and antonyms must be words from SOURCE LANGUAGE; translate each one into TARGET LANGUAGE.
- If WORD is not in SOURCE LANGUAGE, say so briefly in definition and do not silently replace it with another word.
- Give etymology only when you know it. Never invent a root. For uncertain or unavailable information, use empty strings and confidence "unknown".
- Keep lists concise: up to 8 word-family items, 6 synonyms, and 6 antonyms.
- Do not return markdown, commentary, or extra keys.`;
        const result = await model.generateContent(prompt);
        const text = result.response.text().replace(/^```(?:json)?\s*|\s*```$/gi, "").trim();
        const parsed = JSON.parse(text) as TranslationResult;
        const normalized: TranslationResult = {
            sourceLanguage,
            targetLanguage,
            word: asText(parsed.word) || word,
            meaning: asText(parsed.meaning),
            definition: asText(parsed.definition),
            partOfSpeech: asText(parsed.partOfSpeech),
            sourceExample: asText(parsed.sourceExample),
            targetExample: asText(parsed.targetExample),
            wordFamily: asItems(parsed.wordFamily),
            synonyms: asItems(parsed.synonyms),
            antonyms: asItems(parsed.antonyms),
            etymology: parsed.etymology && typeof parsed.etymology === "object" ? {
                rootLanguage: asText(parsed.etymology.rootLanguage),
                root: asText(parsed.etymology.root),
                rootMeaning: asText(parsed.etymology.rootMeaning),
                explanation: asText(parsed.etymology.explanation),
                confidence: ["high", "medium", "low", "unknown"].includes(asText(parsed.etymology.confidence)) ? asText(parsed.etymology.confidence) : "unknown",
            } : { confidence: "unknown" },
        };

        if (!normalized.meaning || !normalized.definition || !normalized.sourceExample || !normalized.targetExample) {
            return NextResponse.json({ error: "Gemini returned incomplete word information." }, { status: 502 });
        }
        return NextResponse.json(normalized);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Translation failed. Please try again.";
        if (message.includes("dunning decision") || message.includes("[403 Forbidden]")) {
            return NextResponse.json({ error: "Gemini translation is unavailable because the Google Cloud billing account linked to this API key needs attention." }, { status: 503 });
        }
        return NextResponse.json({ error: message }, { status: 500 });
    }
}