import { useState, type FormEvent } from "react";
import { Check, Loader2, PenLine, Sparkles } from "lucide-react";
import { useAppData } from "@/context/app-data-context";
import { requestSentenceFeedback } from "@/lib/api-client";
import { insertSentenceAttempt } from "@/lib/supabase/data";
import type { SentenceFeedback, WordRecord } from "@/lib/types";

// Writing a sentence with the word is the step from knowing a word to using it.
export function SentenceCoach({ card }: { card: WordRecord }) {
    const { getCloudContext } = useAppData();
    const [sentence, setSentence] = useState("");
    const [feedback, setFeedback] = useState<SentenceFeedback | null>(null);
    const [checkedSentence, setCheckedSentence] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    async function check(event: FormEvent) {
        event.preventDefault();
        const text = sentence.trim();
        if (!text || loading) return;
        setLoading(true);
        setError("");
        try {
            const result = await requestSentenceFeedback({ word: card.word, meaning: card.meaning, sentence: text, sourceLanguage: card.sourceLanguage, feedbackLanguage: card.targetLanguage, inflected: card.forms ? card.forms.inflected ?? [] : undefined });
            setFeedback(result);
            setCheckedSentence(text);
            const cloud = getCloudContext();
            // Saving the attempt is best effort: the feedback is already shown.
            if (cloud) void insertSentenceAttempt(cloud.client, cloud.userId, cloud.workspaceId, card.id, text, result).catch(() => undefined);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Could not check the sentence.");
        } finally {
            setLoading(false);
        }
    }

    const perfect = feedback && feedback.isNatural && feedback.errors.length === 0;
    return <div className="sentence-coach">
        <form onSubmit={check}>
            <label htmlFor={`sentence-${card.id}`}><PenLine size={13} /> Use “{card.word}” in your own {card.sourceLanguage} sentence</label>
            <textarea id={`sentence-${card.id}`} value={sentence} onChange={(event) => { setSentence(event.target.value); setFeedback(null); }} rows={2} maxLength={400} autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder={card.exampleSentence ? `e.g. ${card.exampleSentence}` : "Write a sentence..."} />
            <button type="submit" className="primary-button" disabled={!sentence.trim() || loading}>{loading ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />} {loading ? "Checking..." : "Check my sentence"}</button>
        </form>
        {error && <p className="sentence-error" role="alert">{error}</p>}
        {feedback && <div className={`sentence-feedback ${perfect ? "right" : "close"}`} role="status">
            <strong>{perfect ? <Check size={15} /> : <PenLine size={15} />} {perfect ? "Natural and correct!" : feedback.isNatural ? "Understandable, with small fixes" : "Let's polish it"}{feedback.cefrLevel && <span className="sentence-level">{feedback.cefrLevel}</span>}</strong>
            {feedback.corrected !== checkedSentence && <p className="sentence-corrected"><span>Better</span>{feedback.corrected}</p>}
            {feedback.errors.length > 0 && <ul>{feedback.errors.map((item, index) => <li key={index}><b>{item.type}</b> {item.explanation}</li>)}</ul>}
            {feedback.comment && <p className="sentence-comment">{feedback.comment}</p>}
        </div>}
    </div>;
}

// Optional step shown under the rating buttons for words the learner already knows a bit.
export function SentenceCoachToggle({ card }: { card: WordRecord }) {
    const [open, setOpen] = useState(false);
    if (!open) return <button type="button" className="ghost-button review-coach-toggle" onClick={() => setOpen(true)}><PenLine size={14} /> Practice in a sentence</button>;
    return <div className="review-coach"><SentenceCoach card={card} /></div>;
}
