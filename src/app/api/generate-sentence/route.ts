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
        const prompt = `Create one short, natural ${sourceLanguage || "foreign language"} example sentence using "${word.trim()}". The learner speaks ${targetLanguage || "English"}. Return only valid JSON with keys sentence and translation.`;
        const result = await model.generateContent(prompt);
        const text = result.response.text().replace(/^```(?:json)?\s*|\s*```$/gi, "").trim();
        const parsed = JSON.parse(text) as { sentence?: string; translation?: string };

        if (!parsed.sentence) {
            return NextResponse.json({ error: "Gemini returned an empty sentence." }, { status: 502 });
        }
        return NextResponse.json({ sentence: parsed.sentence, translation: parsed.translation ?? "" });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Sentence generation failed. Please try again.";
        if (message.includes("dunning decision") || message.includes("[403 Forbidden]")) {
            return NextResponse.json({ error: "Gemini sentence generation is unavailable because the Google Cloud billing account linked to this API key needs attention. Check billing and quota settings, then try again." }, { status: 503 });
        }
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
