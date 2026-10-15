import { useRef } from "react";
import { Eye, Volume2 } from "lucide-react";
import { useReview } from "@/context/review-context";
import { speakWord } from "@/lib/speech";
import type { WordRecord } from "@/lib/types";

export function Flashcard({ card }: { card: WordRecord }) {
    const { isFlipped, setIsFlipped, handleReview } = useReview();
    const touchStart = useRef<{ x: number; y: number } | null>(null);

    return <div className="flashcard-wrap" onTouchStart={(event) => { const touch = event.changedTouches[0]; touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null; }} onTouchEnd={(event) => { const touch = event.changedTouches[0]; const start = touchStart.current; touchStart.current = null; if (!start || !touch || !isFlipped) return; const deltaX = touch.clientX - start.x; const deltaY = touch.clientY - start.y; if (Math.abs(deltaX) > 65 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) handleReview(deltaX > 0 ? "good" : "forgot"); }} onTouchCancel={() => { touchStart.current = null; }}>
        <div className="flashcard-shell"><div className={`flashcard ${isFlipped ? "flipped" : ""}`} onClick={() => setIsFlipped((value) => !value)} role="button" tabIndex={0} aria-label={isFlipped ? "Hide answer" : "Reveal answer"} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setIsFlipped((value) => !value); }}>
            <div className="card-face card-front"><div className="card-topline"><span>{card.sourceLanguage}</span></div><div className="card-word-row"><div className={`card-word ${card.word.length > 16 ? "card-word-long" : ""}`}>{card.word}</div></div>{card.exampleSentence && <div className="card-example"><span>Example</span>{card.exampleSentence}</div>}<div className="card-hint"><Eye size={14} /> Tap to reveal</div></div>
            <div className="card-face card-back"><div className="card-topline"><span>{card.sourceLanguage} → {card.targetLanguage}</span></div><div className="card-word-row card-word-row-answer"><div className={`card-word card-word-answer ${card.word.length > 16 ? "card-word-long" : ""}`}>{card.word}</div></div><div className="card-meaning">{card.meaning || "Add a meaning after this review."}</div>{card.exampleSentence && <div className="card-example"><span>Example</span>{card.exampleSentence}</div>}</div>
        </div><button type="button" className="speaker-button card-speaker" aria-label={`Pronounce ${card.word}`} onClick={(event) => { event.stopPropagation(); speakWord(card.word, card.sourceLanguage); }}><Volume2 size={19} /></button></div>
    </div>;
}
