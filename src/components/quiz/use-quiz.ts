import { useMemo } from "react";
import { useAppData } from "@/context/app-data-context";
import { screenState, useScreenState } from "@/hooks/use-screen-state";
import { requestQuiz, type QuizQuestion } from "@/lib/api-client";
import type { WordRecord } from "@/lib/types";
import { defaultQuizFilters, filterQuizCards, type QuizFilters } from "@/lib/word-filters";

type QuizGenerationOptions = {
    cards?: WordRecord[];
    questionCount?: number;
    focusWords?: string[];
    includeAllCards?: boolean;
};

const questionsState = screenState<QuizQuestion[]>("quiz.questions", []);
const indexState = screenState("quiz.index", 0);
const answerState = screenState("quiz.answer", "");
const submittedState = screenState("quiz.submitted", false);
const generatingState = screenState("quiz.generating", false);
const statusState = screenState("quiz.status", "");
const countState = screenState("quiz.count", 5);
const sourceState = screenState<"recent" | "random">("quiz.source", "recent");
const filtersState = screenState<QuizFilters>("quiz.filters", defaultQuizFilters);

export function useQuiz() {
    const { cards } = useAppData();
    const [quizQuestions, setQuizQuestions] = useScreenState(questionsState);
    const [quizIndex, setQuizIndex] = useScreenState(indexState);
    const [quizAnswer, setQuizAnswer] = useScreenState(answerState);
    const [quizSubmitted, setQuizSubmitted] = useScreenState(submittedState);
    const [quizGenerating, setQuizGenerating] = useScreenState(generatingState);
    const [quizStatus, setQuizStatus] = useScreenState(statusState);
    const [quizCount, setQuizCount] = useScreenState(countState);
    const [quizSource, setQuizSource] = useScreenState(sourceState);
    const [filters, setFilters] = useScreenState(filtersState);
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
        try {
            const selectedCards = [...sourceCards];
            if (!options.focusWords?.length && !options.cards && quizSource === "random") {
                for (let index = selectedCards.length - 1; index > 0; index -= 1) {
                    const randomIndex = Math.floor(Math.random() * (index + 1));
                    [selectedCards[index], selectedCards[randomIndex]] = [selectedCards[randomIndex], selectedCards[index]];
                }
            }
            const questionCount = Math.min(options.questionCount ?? quizCount, selectedCards.length);
            const quizPool = selectedCards.slice(0, options.includeAllCards ? 100 : questionCount);
            setQuizQuestions(await requestQuiz({
                questionCount,
                focusWords: options.focusWords,
                variation: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                cards: quizPool.map((card) => ({ word: card.word, meaning: card.meaning, exampleSentence: card.exampleSentence, sourceLanguage: card.sourceLanguage, targetLanguage: card.targetLanguage, cefrLevel: card.cefrLevel })),
            }));
        } catch (error) {
            setQuizStatus(error instanceof Error ? error.message : "Could not generate a quiz.");
        } finally {
            setQuizGenerating(false);
        }
    }

    function submitQuizAnswer() {
        if (!currentQuizQuestion) return;
        setQuizSubmitted(true);
    }

    function nextQuizQuestion() {
        setQuizIndex((index) => index + 1);
        setQuizAnswer("");
        setQuizSubmitted(false);
    }

    return {
        quizCards, quizQuestions, quizIndex, currentQuizQuestion, quizAnswer, setQuizAnswer, quizSubmitted, quizGenerating, quizStatus,
        quizCount, setQuizCount, quizSource, setQuizSource, filters, updateFilter, clearFilters,
        generateQuiz, submitQuizAnswer, nextQuizQuestion,
    };
}

export type Quiz = ReturnType<typeof useQuiz>;
