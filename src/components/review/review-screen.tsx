import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, ArrowRight, BookOpenCheck, Check, Clock3, Keyboard, BookOpen, ListChecks, PenLine, Settings2, Sparkles, X } from "lucide-react";
import { useQuiz } from "@/components/quiz/use-quiz";
import { DailyGoalProgress } from "@/components/review/daily-goal-progress";
import { Flashcard } from "@/components/review/flashcard";
import { SentenceCoachToggle } from "@/components/review/sentence-coach";
import { TypedCard } from "@/components/review/typed-card";
import { ReviewFilterPanel } from "@/components/review/review-filters";
import { SessionSummary } from "@/components/review/session-summary";
import { useAppData } from "@/context/app-data-context";
import { useNavigation } from "@/context/navigation-context";
import { useReview } from "@/context/review-context";
import { screenState, useScreenState } from "@/hooks/use-screen-state";
import type { WordRecord } from "@/lib/types";

const StoryScreen = dynamic(() => import("@/components/story/story-screen").then((module) => module.StoryScreen));
const QuizScreen = dynamic(() => import("@/components/quiz/quiz-screen").then((module) => module.QuizScreen));

const filtersOpenState = screenState("review.filters-open", false);

export function ReviewScreen() {
    const { cards, isInitialDataLoading, initialDataError } = useAppData();
    const { navigate, openAddWord } = useNavigation();
    const { isFlipped, setIsFlipped, reviewMode, setReviewMode, recallPrompt, typedAttempt, reviewSession, showReviewSummary, setShowReviewSummary, reviewCards, queue, currentCard, handleReview } = useReview();
    const quiz = useQuiz();
    const [reviewFiltersOpen, setReviewFiltersOpen] = useScreenState(filtersOpenState);
    // Not kept between visits: leaving the review screen closes the quiz.
    const [showQuiz, setShowQuiz] = useState(false);
    const [showStory, setShowStory] = useState(false);
    const [sessionPracticeQuiz, setSessionPracticeQuiz] = useState(false);

    useEffect(() => {
        if (!showQuiz && !showReviewSummary && !isInitialDataLoading && !initialDataError && reviewSession?.entries.length && queue.length === 0) {
            setShowReviewSummary(true);
        }
    }, [initialDataError, isInitialDataLoading, queue.length, reviewSession?.entries.length, setShowReviewSummary, showQuiz, showReviewSummary]);

    // After rating, the next card should start at the top, not at the scroll position of the previous result.
    const currentCardKey = currentCard ? `${currentCard.id}-${currentCard.reps}` : "";
    useEffect(() => {
        if (!currentCardKey) return;
        // On phones the page scrolls inside .page-wrap, on desktop the window scrolls.
        const scroller = document.querySelector(".page-wrap");
        if (scroller && scroller.scrollTop > 0) scroller.scrollTo({ top: 0 });
        if (window.scrollY > 0) window.scrollTo({ top: 0 });
    }, [currentCardKey]);

    useEffect(() => {
        const handleKey = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (event.repeat || target?.closest("input, textarea, select")) return;
            if (recallPrompt) {
                // Typed card: the answer is submitted from the form, never un-revealed again.
                if (!isFlipped) return;
                if (event.key === " " || event.key === "Enter") {
                    event.preventDefault();
                    if (typedAttempt) handleReview(typedAttempt.suggested);
                    return;
                }
            } else if (event.key === " " || event.key === "Enter") {
                event.preventDefault();
                if (currentCard) setIsFlipped((value) => !value);
            }
            if (!isFlipped) return;
            if (event.key === "1" || event.key === "ArrowLeft") handleReview("forgot");
            if (event.key === "2") handleReview("hard");
            if (event.key === "3" || event.key === "ArrowRight") handleReview("good");
            if (event.key === "4") handleReview("easy");
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [currentCard, handleReview, isFlipped, recallPrompt, setIsFlipped, typedAttempt]);

    async function startSessionPractice(focusCards: WordRecord[]) {
        const uniqueFocusCards = Array.from(new Map(focusCards.map((card) => [card.id, card])).values()).slice(0, 5);
        if (!uniqueFocusCards.length) return;
        const focusIds = new Set(uniqueFocusCards.map((card) => card.id));
        const quizPool = [...uniqueFocusCards, ...cards.filter((card) => !focusIds.has(card.id))].slice(0, 100);
        quiz.setQuizSource("recent");
        setSessionPracticeQuiz(true);
        setShowReviewSummary(false);
        setShowQuiz(true);
        await quiz.generateQuiz({
            cards: quizPool,
            questionCount: uniqueFocusCards.length,
            focusWords: uniqueFocusCards.map((card) => card.word),
            includeAllCards: true,
        });
    }

    function closeQuiz() {
        setShowQuiz(false);
        if (sessionPracticeQuiz) {
            setSessionPracticeQuiz(false);
            setShowReviewSummary(true);
        }
    }

    if (showStory) return <StoryScreen onClose={() => setShowStory(false)} />;
    if (showQuiz) return <QuizScreen quiz={quiz} practice={sessionPracticeQuiz} onClose={closeQuiz} />;
    return (
        <div className="dashboard-grid">
            <section className="review-stage" aria-label="Review session">
                <div className="stage-head">
                    <div className="stage-progress"><strong>{isInitialDataLoading ? "Loading vocabulary..." : initialDataError ? "Could not load vocabulary" : `${queue.length} cards due`}</strong>{!isInitialDataLoading && !initialDataError && <span>{reviewCards.length} in your library</span>}</div>
                    {!isInitialDataLoading && !initialDataError && !showReviewSummary && <DailyGoalProgress />}
                    <button className="ghost-button quiz-launch-button" onClick={() => setShowQuiz(true)} disabled={!quiz.quizCards.length}><ListChecks size={14} /> Quiz</button>
                    <button className="ghost-button quiz-launch-button" onClick={() => setShowStory(true)} disabled={!cards.length}><BookOpen size={14} /> Story</button>
                    <div className="review-controls">
                        {reviewSession?.entries.length ? <button type="button" className="ghost-button filter-toggle" onClick={() => setShowReviewSummary(true)}><Check size={14} /> Finish</button> : null}
                        <button type="button" className={`ghost-button filter-toggle ${reviewMode === "typed" ? "active" : ""}`} aria-pressed={reviewMode === "typed"} title="Type answers instead of flipping cards" onClick={() => setReviewMode(reviewMode === "typed" ? "flip" : "typed")}><PenLine size={14} /> Typing</button>
                        <button className={`ghost-button filter-toggle ${reviewFiltersOpen ? "active" : ""}`} onClick={() => setReviewFiltersOpen((value) => !value)}><Settings2 size={14} /> Filters</button>
                    </div>
                </div>
                {reviewFiltersOpen && <ReviewFilterPanel />}
                {isInitialDataLoading ? <div className="empty-stage" role="status"><div><h2>Loading your vocabulary...</h2><p>Your review queue is on its way.</p></div></div> : initialDataError ? <div className="empty-stage" role="alert"><div><X size={30} /><h2>Could not load your vocabulary.</h2><p>{initialDataError}</p><button className="primary-button" style={{ marginTop: 22 }} onClick={() => window.location.reload()}>Try again</button></div></div> : showReviewSummary && reviewSession ? <SessionSummary quizGenerating={quiz.quizGenerating} onStartPractice={(focusCards) => void startSessionPractice(focusCards)} /> : cards.length === 0 ? <div className="empty-stage"><div><BookOpenCheck size={30} /><h2>Your vocabulary starts here.</h2><p>Add your first word to start a review queue.</p><button className="primary-button" style={{ marginTop: 22 }} onClick={openAddWord}>Add your first word <ArrowRight size={14} /></button></div></div> : currentCard ? <>
                    {recallPrompt ? <TypedCard key={`typed-${currentCard.id}-${currentCard.reps}`} card={currentCard} prompt={recallPrompt} /> : <Flashcard card={currentCard} />}
                    {isFlipped && currentCard.reps >= 3 && <SentenceCoachToggle key={`coach-${currentCard.id}-${currentCard.reps}`} card={currentCard} />}
                    <div className="stage-actions review-rating-actions"><button className={`review-action forgot${typedAttempt?.suggested === "forgot" ? " suggested" : ""}`} disabled={!isFlipped} onClick={() => handleReview("forgot")}><ArrowLeft size={15} /> Forgot</button><button className={`review-action hard${typedAttempt?.suggested === "hard" ? " suggested" : ""}`} disabled={!isFlipped} onClick={() => handleReview("hard")}><Clock3 size={15} /> Hard</button><button className={`review-action good${typedAttempt?.suggested === "good" ? " suggested" : ""}`} disabled={!isFlipped} onClick={() => handleReview("good")}><Check size={15} /> Good</button><button className={`review-action easy${typedAttempt?.suggested === "easy" ? " suggested" : ""}`} disabled={!isFlipped} onClick={() => handleReview("easy")}><Sparkles size={15} /> Easy</button></div>
                    <div className="stage-footnote"><Keyboard size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} /> {recallPrompt ? (isFlipped ? "Enter to accept the suggested rating · 1 Forgot · 2 Hard · 3 Good · 4 Easy" : "Enter to check your answer") : "Space to reveal · 1 Forgot · 2 Hard · 3 Good · 4 Easy"}</div>
                </> : <div className="empty-stage"><div><Check size={34} /><h2>All clear for now.</h2><p>Your next cards will appear here when they are due. A quiet win.</p><button className="primary-button" style={{ marginTop: 22 }} onClick={() => navigate("words")}>Browse words <ArrowRight size={14} /></button></div></div>}
            </section>
        </div>
    );
}
