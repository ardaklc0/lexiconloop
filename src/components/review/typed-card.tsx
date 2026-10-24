import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, CircleHelp, Volume2, X } from "lucide-react";
import { useReview } from "@/context/review-context";
import { speakWord } from "@/lib/speech";
import { answerVariants, buildAttempt, skippedAttempt, type AnswerGrade, type RecallPrompt } from "@/lib/typed-answer";
import type { WordRecord } from "@/lib/types";

const languageCodes: Record<string, string> = { German: "de", French: "fr", Spanish: "es", Italian: "it", English: "en", Turkish: "tr" };

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
        // Focusing must not scroll the page: on phones the keyboard already moves the view.
        inputRef.current?.focus({ preventScroll: true });
    }, [card.id, card.reps]);

    function check(event: FormEvent) {
        event.preventDefault();
        if (checked || !value.trim()) return;
        const attempt = prompt.mode === "form"
            ? buildAttempt(value, prompt.expected)
            : buildAttempt(value, answerVariants(card.word), prompt.mode === "cloze" ? [prompt.surface] : []);
        submitTypedAttempt({ ...attempt, mode: prompt.mode, formKind: prompt.mode === "form" ? prompt.kind : undefined });
    }

    const correct = typedAttempt && !typedAttempt.skipped && typedAttempt.grade !== "wrong";
    const tone = !typedAttempt ? "" : typedAttempt.grade === "wrong" ? "wrong" : typedAttempt.grade === "close" ? "close" : "right";
    const answerText = prompt.mode === "cloze" ? prompt.surface : prompt.mode === "form" ? prompt.answer : card.word;
    const topLabel = prompt.mode === "cloze" ? "Fill the gap" : prompt.mode === "form" ? "Grammar" : "Type the word";

    return <div className="flashcard-wrap typed-wrap">
        <div className="typed-card">
            <div className="card-topline"><span>{topLabel}</span><span>{prompt.mode === "form" ? card.sourceLanguage : `${card.targetLanguage} → ${card.sourceLanguage}`}</span></div>
            {prompt.mode === "cloze"
                ? <div className="typed-prompt typed-cloze">{prompt.before}<span className={`cloze-gap ${tone}`}>{checked ? answerText : "       "}</span>{prompt.after}</div>
                : <div className="typed-prompt">{prompt.mode === "form" ? card.word : card.meaning}</div>}
            {prompt.mode === "cloze" && <div className="typed-hint">{card.meaning}{prompt.isInflected ? ` · base form: ${card.word}` : ""}</div>}
            {prompt.mode === "form" && <div className="typed-hint typed-question">{prompt.question}<span>{card.meaning}</span></div>}
            {!checked
                ? <form className="typed-form" onSubmit={check}>
                    <input ref={inputRef} value={value} onChange={(event) => setValue(event.target.value)} placeholder={prompt.mode === "form" ? "Your answer..." : `Type in ${card.sourceLanguage}...`} lang={languageCodes[card.sourceLanguage]} autoCapitalize="off" autoComplete="off" autoCorrect="off" spellCheck={false} aria-label="Your answer" />
                    <div className="typed-form-actions">
                        <button type="button" className="ghost-button" onClick={() => submitTypedAttempt({ ...skippedAttempt(), mode: prompt.mode, formKind: prompt.mode === "form" ? prompt.kind : undefined })}><CircleHelp size={14} /> I don&apos;t know</button>
                        <button type="submit" className="primary-button" disabled={!value.trim()}><Check size={14} /> Check</button>
                    </div>
                </form>
                : <div className={`typed-result ${tone}`} role="status">
                    <strong>{correct ? <Check size={15} /> : <X size={15} />} {typedAttempt.skipped ? "Revealed" : verdicts[typedAttempt.grade]}</strong>
                    {!typedAttempt.skipped && typedAttempt.grade !== "exact" && <span className="typed-yours">You typed: {typedAttempt.answer}</span>}
                    <span className="typed-correct">{prompt.mode === "form" ? `${card.word} → ${prompt.answer}` : card.word}<button type="button" className="speaker-button" aria-label={`Pronounce ${card.word}`} onClick={() => speakWord(card.word, card.sourceLanguage)}><Volume2 size={16} /></button></span>
                    {prompt.mode === "reverse" && card.exampleSentence && <span className="typed-yours">{card.exampleSentence}</span>}
                </div>}
        </div>
    </div>;
}
