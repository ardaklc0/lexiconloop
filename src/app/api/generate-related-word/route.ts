import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const asText = (value: unknown) => typeof value === "string" ? value.trim() : "";

export async function POST(request: Request) {
    const supabase = await createSupabaseServerClient();
    if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GEMINI_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ error: "Gemini is not configured yet." }, { status: 503 });

    try {
        const body = await request.json() as {
            sourceLanguage?: string;
            targetLanguage?: string;
            word?: string;
            meaning?: string;
            relation?: "synonym" | "antonym";
        };
        const sourceLanguage = asText(body.sourceLanguage) || "German";
        const targetLanguage = asText(body.targetLanguage) || "English";
        const word = asText(body.word);
        const meaning = asText(body.meaning);
        const relation = body.relation === "antonym" ? "antonym" : "synonym";
        if (!word || !meaning) return NextResponse.json({ error: "A related word and its meaning are required." }, { status: 400 });

        const client = new GoogleGenerativeAI(apiKey);
        const model = client.getGenerativeModel({
            model: "gemini-2.5-flash-lite",
            generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
        });
        const prompt = `You are preparing one vocabulary card.
SOURCE LANGUAGE: ${sourceLanguage}
TARGET LANGUAGE: ${targetLanguage}
WORD: "${word}"
KNOWN TARGET-LANGUAGE MEANING: "${meaning}"
RELATION TO THE MAIN WORD: ${relation}

Return only valid JSON with exactly this shape:
{"meaning":"...","sourceExample":"...","targetExample":"...","cefrLevel":"A1|A2|B1|B2|C1"}

Rules:
- Keep the known meaning faithful; write it only in TARGET LANGUAGE.
- sourceExample must be a short, natural sentence in SOURCE LANGUAGE using WORD.
- targetExample must be the natural translation of sourceExample in TARGET LANGUAGE.
- cefrLevel must be exactly one of A1, A2, B1, B2, or C1 for WORD in SOURCE LANGUAGE.
- Do not return markdown or extra keys.`;
        const result = await model.generateContent(prompt);
        const text = result.response.text().replace(/^```(?:json)?\s*|\s*```$/gi, "").trim();
        const parsed = JSON.parse(text) as { meaning?: string; sourceExample?: string; targetExample?: string; cefrLevel?: string };
        const normalized = {
            meaning: asText(parsed.meaning) || meaning,
            sourceExample: asText(parsed.sourceExample),
            targetExample: asText(parsed.targetExample),
            cefrLevel: ["A1", "A2", "B1", "B2", "C1"].includes(asText(parsed.cefrLevel)) ? asText(parsed.cefrLevel) : "B1",
        };
        if (!normalized.sourceExample || !normalized.targetExample) {
            return NextResponse.json({ error: "Gemini returned incomplete related-word information." }, { status: 502 });
        }
        return NextResponse.json(normalized);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Related-word generation failed. Please try again.";
        if (message.includes("dunning decision") || message.includes("[403 Forbidden]")) {
            return NextResponse.json({ error: "Gemini related-word generation is unavailable because the Google Cloud billing account linked to this API key needs attention." }, { status: 503 });
        }
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
