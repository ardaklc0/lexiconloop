import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
    const supabase = await createSupabaseServerClient();
    if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
        }
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GEMINI_API_KEY?.trim();
    if (!apiKey) {
        return NextResponse.json({ error: "Gemini is not configured yet." }, { status: 503 });
    }

    try {
        const { word, sourceLanguage, targetLanguage } = await request.json();
        if (typeof word !== "string" || !word.trim()) {
            return NextResponse.json({ error: "A word is required." }, { status: 400 });
        }

        const client = new GoogleGenerativeAI(apiKey);
        const model = client.getGenerativeModel({
            model: "gemini-2.5-flash-lite",
            generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
        });
        const source = sourceLanguage || "the source language";
        const target = targetLanguage || "English";
        const prompt = `You are a strict language-learning assistant.
SOURCE LANGUAGE: ${source}
TARGET LANGUAGE: ${target}
WORD: "${word.trim()}"

    Return only valid JSON with exactly these keys: meaning, sentence, and cefrLevel.
- meaning must be a concise translation or definition of WORD written ONLY in TARGET LANGUAGE (${target}). Do not write it in SOURCE LANGUAGE, do not include both languages, and do not add labels.
- sentence must be one short, natural example sentence written ONLY in SOURCE LANGUAGE (${source}) using WORD.
    - cefrLevel must be exactly one of A1, A2, B1, B2, or C1. Estimate the CEFR level of WORD in SOURCE LANGUAGE.
Do not swap the languages. Do not return markdown or any extra text.`;
        const result = await model.generateContent(prompt);
        const text = result.response.text().replace(/^```(?:json)?\s*|\s*```$/gi, "").trim();
        const parsed = JSON.parse(text) as { meaning?: string; sentence?: string; cefrLevel?: string; translation?: string };
        const meaning = parsed.meaning?.trim() || parsed.translation?.trim() || "";
        const cefrLevel = ["A1", "A2", "B1", "B2", "C1"].includes(parsed.cefrLevel ?? "") ? parsed.cefrLevel : undefined;

        if (!meaning || !parsed.sentence?.trim() || !cefrLevel) {
            return NextResponse.json({ error: "Gemini returned incomplete word information." }, { status: 502 });
        }
        return NextResponse.json({ meaning, sentence: parsed.sentence.trim(), cefrLevel });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Sentence generation failed. Please try again.";
        if (message.includes("dunning decision") || message.includes("[403 Forbidden]")) {
            return NextResponse.json({ error: "Gemini sentence generation is unavailable because the Google Cloud billing account linked to this API key needs attention. Check billing and quota settings, then try again." }, { status: 503 });
        }
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
