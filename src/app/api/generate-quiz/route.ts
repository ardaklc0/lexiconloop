import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAllowedEmail } from "@/lib/auth-allowlist";

type QuizQuestion = {
    type: "multiple-choice" | "fill-blank";
    prompt: string;
    options?: string[];
    answer: string;
    explanation: string;
    word: string;
};

type QuizCard = {
    word?: string;
    meaning?: string;
    exampleSentence?: string;
    sourceLanguage?: string;
    targetLanguage?: string;
    cefrLevel?: string;
};

const normalizeQuizText = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase();
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const containsQuizPhrase = (text: string, phrase: string) => {
    const normalizedText = normalizeQuizText(text);
    const normalizedPhrase = normalizeQuizText(phrase);
    if (!normalizedPhrase) return false;
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(normalizedPhrase)}(?=$|[^\\p{L}\\p{N}])`, "u").test(normalizedText);
};

const shuffle = <T,>(items: T[]) => [...items].sort(() => Math.random() - 0.5);

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
        const body = await request.json() as { questionCount?: number; variation?: string; cards?: QuizCard[] };
        const questionCount = Number.isInteger(body.questionCount) ? Math.min(50, Math.max(1, body.questionCount as number)) : 5;
        const cards = (body.cards ?? []).filter((card) => typeof card.word === "string" && card.word.trim()).slice(0, 100);
        if (!cards.length) {
            return NextResponse.json({ error: "Add a few words before starting a quiz." }, { status: 400 });
        }

        const client = new GoogleGenerativeAI(apiKey);
        const model = client.getGenerativeModel({
            model: "gemini-2.5-flash-lite",
            generationConfig: { responseMimeType: "application/json", temperature: 0.35 },
        });
        const prompt = `You are creating a personalized vocabulary quiz.
Create exactly ${questionCount} questions from the learner's word list below. Use a balanced mix of multiple-choice and fill-blank questions. Do not repeat a word until every word has been used; if more questions are requested than words available, reuse words with a different question format or context. This is quiz variation ${body.variation ?? "fresh"}; write fresh prompts and explanations.
For multiple-choice questions, create exactly 4 options: one correct answer and three plausible but incorrect distractors.
For multiple-choice questions, never include the correct answer text in the prompt. The prompt may mention the source word, but it must not reveal the answer or any translation.
For fill-blank questions, use one exampleSentence from the word list and replace the exact source-language word or phrase with "_____". The prompt must remain a natural sentence in the source language, and the answer must be that exact source-language word or phrase. Never ask for a translation in a fill-blank question. Never write instructions such as "Use the English word from the list".
The answer must be the exact word or phrase from the list for fill-blank questions, and the correct option text for multiple-choice questions.
Keep prompts concise. Return only valid JSON with this exact shape: {"questions":[{"type":"multiple-choice"|"fill-blank","prompt":"...","options":["..."],"answer":"...","explanation":"...","word":"..."}]}.

WORD LIST:
${JSON.stringify(cards)}`;
        const result = await model.generateContent(prompt);
        const text = result.response.text().replace(/^```(?:json)?\s*|\s*```$/gi, "").trim();
        const parsed = JSON.parse(text) as { questions?: unknown };
        const questions = Array.isArray(parsed.questions) ? parsed.questions.map((item): QuizQuestion | null => {
            if (!item || typeof item !== "object") return null;
            const question = item as Partial<QuizQuestion>;
            const options = Array.isArray(question.options) ? question.options.filter((option): option is string => typeof option === "string").slice(0, 4) : undefined;
            if ((question.type !== "multiple-choice" && question.type !== "fill-blank") || typeof question.prompt !== "string" || typeof question.answer !== "string" || typeof question.word !== "string") return null;
            if (question.type === "multiple-choice" && (!options || options.length !== 4)) return null;
            const card = cards.find((item) => normalizeQuizText(item.word ?? "") === normalizeQuizText(question.word ?? ""));
            if (!card?.word) return null;
            const answerWord = card.word.trim();
            if (question.type === "fill-blank") {
                if (!card.exampleSentence) return null;
                const wordPattern = new RegExp(escapeRegExp(answerWord), "iu");
                if (!wordPattern.test(card.exampleSentence)) return null;
                const distractors = shuffle(cards
                    .map((item) => item.word?.trim())
                    .filter((word): word is string => {
                        if (!word) return false;
                        return normalizeQuizText(word) !== normalizeQuizText(answerWord);
                    })
                ).slice(0, 3);
                if (distractors.length < 3) return null;
                return {
                    type: "fill-blank",
                    prompt: card.exampleSentence.replace(wordPattern, "_____"),
                    options: shuffle([answerWord, ...distractors]),
                    answer: answerWord,
                    explanation: typeof question.explanation === "string" && question.explanation.trim() ? question.explanation.trim() : `${answerWord} means ${card.meaning?.trim() || "the saved meaning"}.`,
                    word: answerWord,
                } satisfies QuizQuestion;
            }
            if (containsQuizPhrase(question.prompt, question.answer)) return null;
            return {
                type: question.type,
                prompt: question.prompt.trim(),
                ...(options ? { options } : {}),
                answer: question.answer.trim(),
                explanation: typeof question.explanation === "string" ? question.explanation.trim() : "",
                word: question.word.trim(),
            } satisfies QuizQuestion;
        }).filter((question): question is QuizQuestion => question !== null).slice(0, questionCount) : [];

        const completedQuestions = [...questions];
        const fallbackCards = cards.filter((card): card is QuizCard & { word: string } => Boolean(card.word?.trim()));
        let fallbackIndex = 0;
        while (completedQuestions.length < questionCount && fallbackCards.length >= 4) {
            const card = fallbackCards[fallbackIndex % fallbackCards.length];
            fallbackIndex += 1;
            const answerWord = card.word.trim();
            const distractors = shuffle(fallbackCards
                .map((item) => item.word.trim())
                .filter((word) => normalizeQuizText(word) !== normalizeQuizText(answerWord))
            ).slice(0, 3);
            if (distractors.length < 3) break;

            if (card.exampleSentence) {
                const wordPattern = new RegExp(escapeRegExp(answerWord), "iu");
                if (wordPattern.test(card.exampleSentence)) {
                    completedQuestions.push({
                        type: "fill-blank",
                        prompt: card.exampleSentence.replace(wordPattern, "_____"),
                        options: shuffle([answerWord, ...distractors]),
                        answer: answerWord,
                        explanation: `${answerWord} means ${card.meaning?.trim() || "the saved meaning"}.`,
                        word: answerWord,
                    });
                    continue;
                }
            }

            completedQuestions.push({
                type: "multiple-choice",
                prompt: `Which word matches this meaning: "${card.meaning?.trim() || "the saved meaning"}"?`,
                options: shuffle([answerWord, ...distractors]),
                answer: answerWord,
                explanation: `${answerWord} means ${card.meaning?.trim() || "the saved meaning"}.`,
                word: answerWord,
            });
        }

        if (completedQuestions.length < Math.min(3, questionCount)) {
            return NextResponse.json({ error: "Gemini could not create enough quiz questions." }, { status: 502 });
        }
        return NextResponse.json({ questions: completedQuestions.slice(0, questionCount) });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Quiz generation failed. Please try again.";
        if (message.includes("dunning decision") || message.includes("[403 Forbidden]")) {
            return NextResponse.json({ error: "Gemini quiz generation is unavailable because the Google Cloud billing account linked to this API key needs attention." }, { status: 503 });
        }
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
