import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Shared by the AI routes: signed-in user check, API key lookup, and one JSON-mode Gemini call.
export async function requireGeminiUser() {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { error: NextResponse.json({ error: "Authentication is not configured." }, { status: 503 }) };
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: NextResponse.json({ error: "You must be signed in." }, { status: 401 }) };
    const apiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GEMINI_API_KEY?.trim();
    if (!apiKey) return { error: NextResponse.json({ error: "Gemini is not configured yet." }, { status: 503 }) };
    return { apiKey };
}

export async function generateJson(apiKey: string, prompt: string, temperature = 0.2) {
    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
        model: "gemini-2.5-flash-lite",
        generationConfig: { responseMimeType: "application/json", temperature },
    });
    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/^```(?:json)?\s*|\s*```$/gi, "").trim();
    return JSON.parse(text) as Record<string, unknown>;
}

export function geminiErrorResponse(error: unknown, fallback: string) {
    const message = error instanceof Error ? error.message : fallback;
    if (message.includes("dunning decision") || message.includes("[403 Forbidden]")) {
        return NextResponse.json({ error: "Gemini is unavailable because the Google Cloud billing account linked to this API key needs attention." }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
}

export const asText = (value: unknown) => (typeof value === "string" ? value.trim() : "");
