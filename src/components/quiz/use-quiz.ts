import { useMemo } from "react";
import { useAppData } from "@/context/app-data-context";
import { screenState, useScreenState } from "@/hooks/use-screen-state";
import { requestQuiz, type QuizQuestion } from "@/lib/api-client";
import { judgeQuizAnswer, type QuizVerdict } from "@/lib/quiz-answers";
import { buildLocalQuestions } from "@/lib/quiz-local";
import { loadErroredSentences, pullWordsForward } from "@/lib/supabase/data";
import type { WordRecord } from "@/lib/types";
import { defaultQuizFilters, filterQuizCards, type QuizFilters } from "@/lib/word-filters";

type QuizGenerationOptions = {
    cards?: WordRecord[];
    questionCount?: number;
    focusWords?: string[];
    includeAllCards?: boolean;
};

export type QuizSource = "recent" | "random" | "weak";
export type QuizResult = { word: string; verdict: QuizVerdict };

// Share of a quiz that is built from stored grammar data and earlier sentence corrections instead of the AI.
const LOCAL_SHARE = 0.4;

const questionsState = screenState<QuizQuestion[]>("quiz.questions", []);
const indexState = screenState("quiz.index", 0);
const answerState = screenState("quiz.answer", "");
const submittedState = screenState("quiz.submitted", false);
const generatingState = screenState("quiz.generating", false);
const statusState = screenState("quiz.status", "");
const countState = screenState("quiz.count", 5);
const sourceState = screenState<QuizSource>("quiz.source", "recent");
const filtersState = screenState<QuizFilters>("quiz.filters", defaultQuizFilters);
const resultsState = screenState<QuizResult[]>("quiz.results", []);

const shuffle = <T,>(items: T[]) => [...items].sort(() => Math.random() - 0.5);

// The higher, the more a word needs practice: forgotten often, hard, still being learned, short memory.
const weaknessScore = (card: WordRecord) => card.lapses * 3 + card.difficulty + (card.state === "learning" ? 2 : 0) - Math.min(card.stability, 10) * 0.3;

export function useQuiz() {
    const { cards, setCards, getCloudContext } = useAppData();
    const [quizQuestions, setQuizQuestions] = useScreenState(questionsState);
    const [quizIndex, setQuizIndex] = useScreenState(indexState);
    const [quizAnswer, setQuizAnswer] = useScreenState(answerState);
    const [quizSubmitted, setQuizSubmitted] = useScreenState(submittedState);
    const [quizGenerating, setQuizGenerating] = useScreenState(generatingState);
    const [quizStatus, setQuizStatus] = useScreenState(statusState);
    const [quizCount, setQuizCount] = useScreenState(countState);
    const [quizSource, setQuizSource] = useScreenState(sourceState);
    const [filters, setFilters] = useScreenState(filtersState);
    const [quizResults, setQuizResults] = useScreenState(resultsState);
    const quizCards = useMemo(() => filterQuizCards(cards, filters), [cards, filters]);
    const currentQuizQuestion = quizQuestions[quizIndex];

    const updateFilter = <K extends keyof QuizFilters>(key: K, value: QuizFilters[K]) =>
        setFilters((previous) => ({ ...previous, [key]: value }));
    const clearFilters = () => setFilters(defaultQuizFilters);

    async function generateQuiz(options: QuizGenerationOptions = {}) {
        const sourceCards = options.cards ?? quizCards;
        if (!sourceCards.length) {
            setQuizStatus("Add a few words before starting a quiz.");
            return;
        }
        setQuizGenerating(true);
        setQuizStatus("");
        setQuizQuestions([]);
        setQuizIndex(0);
        setQuizAnswer("");
        setQuizSubmitted(false);
        setQuizResults([]);
        try {
            const focusing = Boolean(options.focusWords?.length);
            let selectedCards = [...sourceCards];
            if (!focusing && !options.cards) {
                if (quizSource === "random") selectedCards = shuffle(selectedCards);
                if (quizSource === "weak") selectedCards.sort((first, second) => weaknessScore(second) - weaknessScore(first));
            }
            const questionCount = Math.min(options.questionCount ?? quizCount, selectedCards.length);
            const quizPool = selectedCards.slice(0, options.includeAllCards ? 100 : questionCount);

            // Part of the quiz needs no AI: grammar questions from stored forms and earlier corrected sentences.
            let localQuestions: QuizQuestion[] = [];
            if (!focusing) {
                const cloud = getCloudContext();
                const errored = cloud ? await loadErroredSentences(cloud.client, cloud.userId, cloud.workspaceId).catch(() => []) : [];
                localQuestions = buildLocalQuestions(quizPool, errored, Math.round(questionCount * LOCAL_SHARE));
            }
            const localWords = new Set(localQuestions.map((question) => question.word));
            const aiCount = questionCount - localQuestions.length;
            const aiWords = quizPool.filter((card) => !localWords.has(card.word)).map((card) => card.word);

            let aiQuestions: QuizQuestion[] = [];
            if (aiCount > 0) {
                try {
                    aiQuestions = await requestQuiz({
                        questionCount: aiCount,
                        focusWords: focusing ? options.focusWords : localQuestions.length ? aiWords.slice(0, aiCount) : undefined,
                        variation: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                        cards: quizPool.map((card) => ({
                            word: card.word,
                            meaning: card.meaning,
                            exampleSentence: card.exampleSentence,
                            clozeSentences: card.clozeSentences,
                            inflected: card.forms?.inflected,
                            partOfSpeech: card.forms?.partOfSpeech,
                            sourceLanguage: card.sourceLanguage,
                            targetLanguage: card.targetLanguage,
                            cefrLevel: card.cefrLevel,
                        })),
                    });
                } catch (error) {
                    if (!localQuestions.length) throw error;
                    setQuizStatus("Some questions could not be generated, so this quiz is shorter.");
                }
            }
            setQuizQuestions(focusing ? aiQuestions : shuffle([...localQuestions, ...aiQuestions]));
        } catch (error) {
            setQuizStatus(error instanceof Error ? error.message : "Could not generate a quiz.");
        } finally {
            setQuizGenerating(false);
        }
    }

    // A missed word is brought back into today's review (its due time moves earlier, never later).
    function bringBack(word: string) {
        const card = cards.find((item) => item.word === word);
        if (!card) return;
        const now = new Date().toISOString();
        if (new Date(card.dueAt).getTime() <= Date.now()) return;
        setCards((previous) => previous.map((item) => item.id === card.id ? { ...item, dueAt: now } : item));
        const cloud = getCloudContext();
        if (cloud) void pullWordsForward(cloud.client, cloud.userId, cloud.workspaceId, [card.id], now).catch(() => undefined);
    }

    function submitQuizAnswer(options: { reschedule?: boolean } = {}) {
        if (!currentQuizQuestion) return;
        const verdict = judgeQuizAnswer(currentQuizQuestion, quizAnswer);
        setQuizResults((previous) => [...previous, { word: currentQuizQuestion.word, verdict }]);
        setQuizSubmitted(true);
        if (verdict !== "correct" && options.reschedule) bringBack(currentQuizQuestion.word);
    }

    function nextQuizQuestion() {
        setQuizIndex((index) => index + 1);
        setQuizAnswer("");
        setQuizSubmitted(false);
    }

    return {
        quizCards, quizQuestions, quizIndex, currentQuizQuestion, quizAnswer, setQuizAnswer, quizSubmitted, quizGenerating, quizStatus,
        quizCount, setQuizCount, quizSource, setQuizSource, filters, updateFilter, clearFilters, quizResults,
        generateQuiz, submitQuizAnswer, nextQuizQuestion,
    };
}

export type Quiz = ReturnType<typeof useQuiz>;
