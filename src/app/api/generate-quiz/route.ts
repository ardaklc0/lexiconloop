import { NextResponse } from "next/server";
import { asText, geminiErrorResponse, generateJson, requireGeminiUser } from "@/lib/server/gemini";
import { buildGapQuestion, cleanOptions, containsQuizPhrase, normalizeQuizText, pickDistractors, shuffle, strings, type NamedCard, type QuizCard } from "@/lib/server/quiz-build";
import type { QuizQuestion } from "@/lib/api-client";

export async function POST(request: Request) {
    const auth = await requireGeminiUser();
    if (auth.error) return auth.error;

    try {
        const body = await request.json() as { questionCount?: number; variation?: string; focusWords?: string[]; cards?: QuizCard[] };
        const questionCount = Number.isInteger(body.questionCount) ? Math.min(50, Math.max(1, body.questionCount as number)) : 5;
        const cards = (body.cards ?? [])
            .filter((card) => typeof card.word === "string" && card.word.trim())
            .slice(0, 100)
            .map((card): NamedCard => ({
                ...card,
                word: card.word!.trim(),
                inflected: strings(card.inflected),
                clozeSentences: strings(card.clozeSentences),
            }));
        if (!cards.length) {
            return NextResponse.json({ error: "Add a few words before starting a quiz." }, { status: 400 });
        }
        const availableWords = new Set(cards.map((card) => normalizeQuizText(card.word)));
        const focusWords = Array.from(new Set((body.focusWords ?? [])
            .filter((word): word is string => typeof word === "string" && Boolean(word.trim()))
            .filter((word) => availableWords.has(normalizeQuizText(word))))).slice(0, questionCount);
        const focusWordSet = new Set(focusWords.map(normalizeQuizText));

        const languageCounts = new Map<string, number>();
        cards.forEach((card) => card.targetLanguage && languageCounts.set(card.targetLanguage, (languageCounts.get(card.targetLanguage) ?? 0) + 1));
        const feedbackLanguage = Array.from(languageCounts.entries()).sort((first, second) => second[1] - first[1])[0]?.[0] ?? "English";

        const focusInstructions = focusWords.length
            ? `FOCUS WORDS: ${JSON.stringify(focusWords)}. Make each of the first ${focusWords.length} questions practice a different focus word. Do not use non-focus words as question answers until every focus word has been used.`
            : "";
        const prompt = `You are creating a personalized vocabulary quiz.
Create exactly ${questionCount} questions from the learner's word list below. Use a balanced mix of multiple-choice and fill-blank questions. Do not repeat a word until every word has been used; if more questions are requested than words available, reuse words with a different question format or context. This is quiz variation ${body.variation ?? "fresh"}; write fresh prompts and explanations.
${focusInstructions}
Write every explanation in ${feedbackLanguage}, in one short sentence that says why the answer is right.
For multiple-choice questions, create exactly 4 different options: one correct answer and three plausible but clearly incorrect distractors. Make sure no distractor could also be correct.
For multiple-choice questions, never include the correct answer text in the prompt. The prompt may mention the source word, but it must not reveal the answer or any translation.
For fill-blank questions, set "word" to the word from the list that the blank practices, and give any prompt. The blank sentence is built from the word's own example sentence afterwards.
The answer must be the exact word or phrase from the list for fill-blank questions, and the correct option text for multiple-choice questions.
Keep prompts concise. Return only valid JSON with this exact shape: {"questions":[{"type":"multiple-choice"|"fill-blank","prompt":"...","options":["..."],"answer":"...","explanation":"...","word":"..."}]}.

WORD LIST:
${JSON.stringify(cards.map((card) => ({ word: card.word, meaning: card.meaning, exampleSentence: card.exampleSentence, sourceLanguage: card.sourceLanguage, targetLanguage: card.targetLanguage, cefrLevel: card.cefrLevel })))}`;
        const parsed = await generateJson(auth.apiKey, prompt, 0.35, "gemini-2.5-flash");
        const questions = (Array.isArray(parsed.questions) ? parsed.questions : []).map((item): QuizQuestion | null => {
            if (!item || typeof item !== "object") return null;
            const question = item as Record<string, unknown>;
            const type = question.type;
            const questionPrompt = asText(question.prompt);
            const answer = asText(question.answer);
            const wordText = asText(question.word);
            if ((type !== "multiple-choice" && type !== "fill-blank") || !questionPrompt || !wordText) return null;
            const card = cards.find((candidate) => normalizeQuizText(candidate.word) === normalizeQuizText(wordText));
            if (!card) return null;
            const explanation = asText(question.explanation);
            if (type === "fill-blank") return buildGapQuestion(card, cards, explanation || undefined);
            const cleaned = cleanOptions(strings(question.options), answer);
            if (!cleaned || containsQuizPhrase(questionPrompt, cleaned.answer)) return null;
            return { type: "multiple-choice", prompt: questionPrompt, options: cleaned.options, answer: cleaned.answer, explanation, word: card.word };
        }).filter((question): question is QuizQuestion => question !== null).slice(0, questionCount);

        const completedFocusWords = new Set<string>();
        const completedQuestions = focusWords.length
            ? questions.filter((question) => {
                const word = normalizeQuizText(question.word);
                if (!focusWordSet.has(word) || completedFocusWords.has(word)) return false;
                completedFocusWords.add(word);
                return true;
            })
            : [...questions];
        let fallbackIndex = 0;
        while (completedQuestions.length < questionCount && cards.length >= 4) {
            const card = focusWords.length
                ? cards.find((candidate) => focusWordSet.has(normalizeQuizText(candidate.word)) && !completedFocusWords.has(normalizeQuizText(candidate.word)))
                : cards[fallbackIndex % cards.length];
            if (!card) break;
            if (!focusWords.length) fallbackIndex += 1;
            completedFocusWords.add(normalizeQuizText(card.word));
            const gap = buildGapQuestion(card, cards);
            if (gap) {
                completedQuestions.push(gap);
                continue;
            }
            const distractors = pickDistractors(card, cards, false);
            if (distractors.length < 3) break;
            completedQuestions.push({
                type: "multiple-choice",
                prompt: `Which word matches this meaning: "${card.meaning?.trim() || "the saved meaning"}"?`,
                options: shuffle([card.word, ...distractors]),
                answer: card.word,
                explanation: `${card.word} means ${card.meaning?.trim() || "the saved meaning"}.`,
                word: card.word,
            });
        }

        if (completedQuestions.length < Math.min(3, questionCount)) {
            return NextResponse.json({ error: "Gemini could not create enough quiz questions." }, { status: 502 });
        }
        return NextResponse.json({ questions: completedQuestions.slice(0, questionCount) });
    } catch (error) {
        return geminiErrorResponse(error, "Quiz generation failed. Please try again.");
    }
}
