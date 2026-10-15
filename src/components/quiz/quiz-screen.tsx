import { useMemo } from "react";
import { ArrowLeft, ArrowRight, Check, ListChecks, Sparkles } from "lucide-react";
import type { Quiz } from "@/components/quiz/use-quiz";
import { FilterSelect, folderFilterOptions } from "@/components/ui/filter-select";
import { useAppData } from "@/context/app-data-context";
import { cefrLevels } from "@/lib/constants";
import { collectLanguages } from "@/lib/word-filters";

const cardStateOptions = [{ value: "new", label: "New" }, { value: "learning", label: "Learning" }, { value: "review", label: "Review" }, { value: "mastered", label: "Mastered" }];

const normalizeQuizAnswer = (value: string) =>
    value.normalize("NFKC").trim().toLocaleLowerCase().replace(/^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu, "").replace(/\s+/g, " ");

export function QuizScreen({ quiz, practice, onClose }: { quiz: Quiz; practice: boolean; onClose: () => void }) {
    const { cards, folders } = useAppData();
    const { quizCards, quizQuestions, quizIndex, currentQuizQuestion, quizAnswer, setQuizAnswer, quizSubmitted, quizGenerating, quizStatus, quizCount, setQuizCount, quizSource, setQuizSource, filters, updateFilter, clearFilters, generateQuiz, submitQuizAnswer, nextQuizQuestion } = quiz;
    const sourceLanguages = useMemo(() => collectLanguages(cards, "sourceLanguage"), [cards]);
    const targetLanguages = useMemo(() => collectLanguages(cards, "targetLanguage"), [cards]);
    const isFinished = quizQuestions.length > 0 && quizIndex >= quizQuestions.length;
    const isCorrect = currentQuizQuestion ? normalizeQuizAnswer(quizAnswer) === normalizeQuizAnswer(currentQuizQuestion.answer) : false;

    return <section className="quiz-page">
        <button className="ghost-button quiz-back-button" onClick={onClose}><ArrowLeft size={14} />{practice ? "Back to recap" : "Back to review"}</button>
        <div className="quiz-intro surface-panel">
            <div><div className="eyebrow">{practice ? "Focused practice" : "Personal practice"}</div><h2>{practice ? "Strengthen difficult words." : "Learn by retrieval"}</h2><p>{practice ? "AI questions focus on words you marked Forgot or Hard." : "Questions are built from your vocabulary and reshuffled for each new quiz."}</p></div>
            {practice ? <div className="session-practice-label"><Sparkles size={15} />Practice only · does not change your review schedule</div> : <div className="quiz-settings"><label>Questions<input type="number" min="1" max="50" step="1" value={quizCount} onChange={(event) => setQuizCount(Math.min(50, Math.max(1, Number(event.target.value) || 1)))} /></label><label>Words<select value={quizSource} onChange={(event) => setQuizSource(event.target.value as "recent" | "random")}><option value="recent">Recent</option><option value="random">Random</option></select></label><button className="primary-button" onClick={() => void generateQuiz()} disabled={quizGenerating || !quizCards.length}><Sparkles size={15} />{quizGenerating ? "Generating..." : quizQuestions.length ? "New quiz" : "Generate quiz"}</button></div>}
        </div>
        {!practice && <div className="filter-panel quiz-filter-panel"><div className="filter-panel-head"><strong>Quiz filters</strong><button type="button" className="text-button" onClick={clearFilters}>Clear</button></div><div className="filter-grid">
            <FilterSelect label="Source language" value={filters.sourceLanguage} options={sourceLanguages} onChange={(value) => updateFilter("sourceLanguage", value)} />
            <FilterSelect label="Target language" value={filters.targetLanguage} options={targetLanguages} onChange={(value) => updateFilter("targetLanguage", value)} />
            <FilterSelect label="Folder" value={filters.folderId} options={folderFilterOptions(folders)} onChange={(value) => updateFilter("folderId", value)} />
            <FilterSelect label="CEFR" value={filters.cefrLevel} options={cefrLevels} onChange={(value) => updateFilter("cefrLevel", value)} />
            <FilterSelect label="Card state" value={filters.cardState} options={cardStateOptions} onChange={(value) => updateFilter("cardState", value)} />
        </div><div className="filter-result-count">{quizCards.length} {quizCards.length === 1 ? "word" : "words"} match these filters.</div></div>}
        {quizStatus && <div className="form-note">{quizStatus}</div>}
        {!quizQuestions.length && !quizStatus && <div className="quiz-empty surface-panel"><ListChecks size={30} /><h2>{practice ? "Preparing your focused questions..." : `Your next ${Math.min(quizCount, quizCards.length || quizCount)} questions`}</h2><p>{practice ? "The questions will focus on the words you found difficult." : "Generate a mix of multiple-choice and fill-in-the-blank questions from your filtered vocabulary."}</p></div>}
        {isFinished && <div className="quiz-empty surface-panel"><Check size={30} /><h2>{practice ? "Practice complete" : "Quiz complete"}</h2><p>You finished {quizQuestions.length} questions{practice ? ". These answers did not change your review schedule." : ". A fresh set will use your current review queue."}</p><button className="ghost-button" onClick={onClose}>{practice ? "Back to recap" : "Back to review"}</button></div>}
        {currentQuizQuestion && !isFinished && <div className="quiz-question surface-panel"><div className="quiz-question-head"><span>Question {quizIndex + 1} of {quizQuestions.length}</span><span>{currentQuizQuestion.type === "multiple-choice" ? "Multiple choice" : "Fill in the blank"}</span></div><div className="quiz-progress"><span style={{ width: `${((quizIndex + 1) / quizQuestions.length) * 100}%` }} /></div><h2>{currentQuizQuestion.prompt}</h2><div className="quiz-options">{currentQuizQuestion.options?.map((option) => <button className={`quiz-option ${!quizSubmitted && option === quizAnswer ? "selected" : ""} ${quizSubmitted && option === currentQuizQuestion.answer ? "correct" : ""} ${quizSubmitted && option === quizAnswer && option !== currentQuizQuestion.answer ? "incorrect" : ""}`} key={option} onClick={() => { if (!quizSubmitted) setQuizAnswer(option); }} disabled={quizSubmitted}>{option}</button>)}</div>{quizSubmitted && <div className={`quiz-feedback ${isCorrect ? "correct" : "incorrect"}`}><strong>{isCorrect ? "Correct" : `Correct answer: ${currentQuizQuestion.answer}`}</strong><span>{currentQuizQuestion.explanation || (quizAnswer.trim() ? "Keep practicing this word." : "The answer is shown above. Try to remember it for next time.")}</span></div>}<div className="quiz-actions">{!quizSubmitted ? <button className="primary-button" onClick={submitQuizAnswer}>Check answer</button> : <button className="primary-button" onClick={nextQuizQuestion}>{quizIndex + 1 === quizQuestions.length ? "Finish" : "Next question"}<ArrowRight size={15} /></button>}</div></div>}
    </section>;
}
