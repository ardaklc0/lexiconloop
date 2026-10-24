import { NextResponse } from "next/server";
import { asText, geminiErrorResponse, generateJson, requireGeminiUser } from "@/lib/server/gemini";
import type { WeeklyStats, WeeklySummary } from "@/lib/weekly-stats";

const lines = (value: unknown, limit: number) => (Array.isArray(value) ? value : []).map(asText).filter(Boolean).slice(0, limit);

export async function POST(request: Request) {
    const auth = await requireGeminiUser();
    if (auth.error) return auth.error;

    try {
        const body = await request.json() as { stats?: WeeklyStats; feedbackLanguage?: string };
        const stats = body.stats;
        const language = asText(body.feedbackLanguage) || "English";
        if (!stats || typeof stats.reviews !== "number") return NextResponse.json({ error: "Weekly statistics are required." }, { status: 400 });
        if (stats.reviews === 0 && stats.sentenceAttempts === 0) return NextResponse.json({ error: "There is no activity this week yet." }, { status: 400 });

        const prompt = `You are a supportive language coach writing a weekly review for a learner. Write everything in ${language}.
These are the learner's real numbers for the last 7 days (JSON):
${JSON.stringify(stats)}

Field notes: accuracy and typedAccuracy are percentages. grammarKinds lists grammar question types (article, plural, perfect, pastSimple, prefix) with how often each was asked and answered wrongly. sentenceErrorTypes counts mistakes found in sentences the learner wrote. missedNouns are nouns they got wrong, with their article.

Return only valid JSON with exactly these keys:
- headline: one encouraging sentence about the week.
- highlights: 2 to 3 short sentences about what went well or the key numbers.
- patterns: 0 to 3 short sentences naming a real pattern visible in the data, for example a grammar type with many mistakes, repeated error types, or a spelling pattern shared by missedNouns (such as nouns ending in -ung being feminine). Only state patterns the data supports. Use an empty array when there are none.
- focus: 2 to 3 concrete, actionable suggestions for next week.

Use only the numbers above, never invent statistics, and keep each sentence short. No markdown, no extra text.`;
        const raw = await generateJson(auth.apiKey, prompt, 0.4, "gemini-2.5-flash");
        const summary: WeeklySummary = {
            headline: asText(raw.headline),
            highlights: lines(raw.highlights, 3),
            patterns: lines(raw.patterns, 3),
            focus: lines(raw.focus, 3),
        };
        if (!summary.headline) return NextResponse.json({ error: "Gemini returned an empty summary." }, { status: 502 });
        return NextResponse.json(summary);
    } catch (error) {
        return geminiErrorResponse(error, "Could not write the weekly summary.");
    }
}
