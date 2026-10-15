import { Sparkles } from "lucide-react";
import { useAppData } from "@/context/app-data-context";
import { useReview } from "@/context/review-context";
import { useToday } from "@/hooks/use-clock";
import { getTodayLogs } from "@/lib/streak";
import type { WordRecord } from "@/lib/types";

export function SessionSummary({ quizGenerating, onStartPractice }: { quizGenerating: boolean; onStartPractice: (focusCards: WordRecord[]) => void }) {
    const { cards, logs, dailyGoal } = useAppData();
    const { reviewSession, setReviewSession, setShowReviewSummary, queue } = useReview();
    const todayLogs = getTodayLogs(logs, new Date(useToday()));
    if (!reviewSession) return null;
    const forgotten = reviewSession.entries.filter((entry) => entry.rating === "forgot");
    const hard = reviewSession.entries.filter((entry) => entry.rating === "hard");
    const remembered = reviewSession.entries.filter((entry) => entry.rating === "good" || entry.rating === "easy");
    const sessionFocusIds = new Set([...forgotten, ...hard].map((entry) => entry.wordId));
    const sessionFocusCards = cards.filter((card) => sessionFocusIds.has(card.id));
    const historicFocusCards = cards
        .filter((card) => card.lapses > 0 && !sessionFocusIds.has(card.id))
        .sort((first, second) => second.lapses - first.lapses);
    const practiceCards = [...sessionFocusCards, ...historicFocusCards]
        .filter((card, index, allCards) => allCards.findIndex((item) => item.id === card.id) === index)
        .slice(0, 5);
    const elapsedMinutes = Math.max(1, Math.round((Date.now() - reviewSession.startedAt) / 60_000));
    const goalReached = todayLogs.length >= dailyGoal;

    return <div className="empty-stage session-summary" role="status">
        <div>
            <div className="eyebrow">Review session complete</div>
            <h2>Good work. Here&apos;s your recap.</h2>
            <p>{reviewSession.entries.length} cards in {elapsedMinutes} min · {goalReached ? `Daily goal reached (${todayLogs.length}/${dailyGoal})` : `${todayLogs.length}/${dailyGoal} reviews toward today’s goal`}</p>
            <div className="session-summary-stats">
                <div><strong>{reviewSession.entries.length}</strong><span>Reviewed</span></div>
                <div><strong>{remembered.length}</strong><span>Remembered</span></div>
                <div><strong>{hard.length}</strong><span>Hard</span></div>
                <div><strong>{forgotten.length}</strong><span>Forgot</span></div>
            </div>
            {(hard.length > 0 || forgotten.length > 0) && <p className="session-summary-note">Your Hard and Forgot cards are ready for a short AI practice.</p>}
            {practiceCards.length > 0 && <button className="primary-button" onClick={() => onStartPractice(practiceCards)} disabled={quizGenerating}><Sparkles size={15} />{quizGenerating ? "Preparing practice..." : `AI practice · ${Math.min(5, practiceCards.length)} words`}</button>}
            <div className="session-summary-actions">
                {queue.length > 0 && <button className="ghost-button" onClick={() => setShowReviewSummary(false)}>Continue review</button>}
                <button className="ghost-button" onClick={() => { setReviewSession(null); setShowReviewSummary(false); }}>Done for now</button>
            </div>
        </div>
    </div>;
}
