import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAllowedEmail } from "@/lib/auth-allowlist";

export async function POST(request: Request) {
    const supabase = await createSupabaseServerClient();
    if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !isAllowedEmail(user.email)) {
            return NextResponse.json({ error: "You must be signed in with an allowed account." }, { status: 401 });
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
            generationConfig: { responseMimeType: "application/json" },
        });
        const prompt = `For the ${sourceLanguage || "foreign language"} word or phrase "${word.trim()}", provide a concise meaning in ${targetLanguage || "English"} and one short, natural example sentence in ${sourceLanguage || "foreign language"}. Return only valid JSON with keys meaning and sentence.`;
        const result = await model.generateContent(prompt);
        const text = result.response.text().replace(/^```(?:json)?\s*|\s*```$/gi, "").trim();
        const parsed = JSON.parse(text) as { meaning?: string; sentence?: string; translation?: string };
        const meaning = parsed.meaning?.trim() || parsed.translation?.trim() || "";

        if (!meaning || !parsed.sentence?.trim()) {
            return NextResponse.json({ error: "Gemini returned incomplete word information." }, { status: 502 });
        }
        return NextResponse.json({ meaning, sentence: parsed.sentence.trim() });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Sentence generation failed. Please try again.";
        if (message.includes("dunning decision") || message.includes("[403 Forbidden]")) {
            return NextResponse.json({ error: "Gemini sentence generation is unavailable because the Google Cloud billing account linked to this API key needs attention. Check billing and quota settings, then try again." }, { status: 503 });
        }
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
