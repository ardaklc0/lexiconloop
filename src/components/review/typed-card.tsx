import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, CircleHelp, Volume2, X } from "lucide-react";
import { useReview } from "@/context/review-context";
import { speakWord } from "@/lib/speech";
import { answerVariants, buildAttempt, skippedAttempt, type AnswerGrade, type RecallPrompt } from "@/lib/typed-answer";
import type { WordRecord } from "@/lib/types";

const verdicts: Record<AnswerGrade, string> = {
    exact: "Correct!",
    accent: "Correct, mind the spelling",
    close: "Almost, check the spelling",
    wrong: "Not quite",
};

export function TypedCard({ card, prompt }: { card: WordRecord; prompt: RecallPrompt }) {
    const { typedAttempt, submitTypedAttempt } = useReview();
    const [value, setValue] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    const checked = typedAttempt !== null;

    useEffect(() => {
        setValue("");
        inputRef.current?.focus();
    }, [card.id, card.reps]);

    function check(event: FormEvent) {
        event.preventDefault();
        if (checked || !value.trim()) return;
        submitTypedAttempt(buildAttempt(value, answerVariants(card.word), prompt.mode === "cloze" ? [prompt.surface] : []));
    }

    const correct = typedAttempt && !typedAttempt.skipped && typedAttempt.grade !== "wrong";
    const tone = !typedAttempt ? "" : typedAttempt.grade === "wrong" ? "wrong" : typedAttempt.grade === "close" ? "close" : "right";
    const answerText = prompt.mode === "cloze" ? prompt.surface : card.word;

    return <div className="flashcard-wrap typed-wrap">
        <div className="typed-card">
            <div className="card-topline"><span>{prompt.mode === "cloze" ? "Fill the gap" : "Type the word"}</span><span>{card.targetLanguage} → {card.sourceLanguage}</span></div>
            {prompt.mode === "cloze"
                ? <div className="typed-prompt typed-cloze">{prompt.before}<span className={`cloze-gap ${tone}`}>{checked ? answerText : "       "}</span>{prompt.after}</div>
                : <div className="typed-prompt">{card.meaning}</div>}
            {prompt.mode === "cloze" && <div className="typed-hint">{card.meaning}</div>}
            {!checked
                ? <form className="typed-form" onSubmit={check}>
                    <input ref={inputRef} value={value} onChange={(event) => setValue(event.target.value)} placeholder={`Type in ${card.sourceLanguage}...`} lang={card.sourceLanguage === "German" ? "de" : undefined} autoCapitalize="off" autoComplete="off" autoCorrect="off" spellCheck={false} aria-label="Your answer" />
                    <div className="typed-form-actions">
                        <button type="button" className="ghost-button" onClick={() => submitTypedAttempt(skippedAttempt())}><CircleHelp size={14} /> I don&apos;t know</button>
                        <button type="submit" className="primary-button" disabled={!value.trim()}><Check size={14} /> Check</button>
                    </div>
                </form>
                : <div className={`typed-result ${tone}`} role="status">
                    <strong>{correct ? <Check size={15} /> : <X size={15} />} {typedAttempt.skipped ? "Revealed" : verdicts[typedAttempt.grade]}</strong>
                    {!typedAttempt.skipped && typedAttempt.grade !== "exact" && <span className="typed-yours">You typed: {typedAttempt.answer}</span>}
                    <span className="typed-correct">{card.word}<button type="button" className="speaker-button" aria-label={`Pronounce ${card.word}`} onClick={() => speakWord(card.word, card.sourceLanguage)}><Volume2 size={16} /></button></span>
                    {prompt.mode === "reverse" && card.exampleSentence && <span className="typed-yours">{card.exampleSentence}</span>}
                </div>}
        </div>
    </div>;
}
