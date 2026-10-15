import { ArrowLeft, BarChart3, Pencil, Volume2 } from "lucide-react";
import { DueIn } from "@/components/ui/due-in";
import { useAppData } from "@/context/app-data-context";
import { detailReturnViewState, selectedWordIdState, useNavigation } from "@/context/navigation-context";
import { useScreenState } from "@/hooks/use-screen-state";
import { sameId } from "@/lib/ids";
import { speakWord } from "@/lib/speech";
import type { ReviewRating } from "@/lib/types";

const ratingLabels: Record<ReviewRating, string> = { forgot: "Forgot", hard: "Hard", good: "Good", easy: "Easy" };

export function WordDetail() {
    const { cards, folders, logs } = useAppData();
    const { navigate, openEditWord } = useNavigation();
    const [selectedWordId, setSelectedWordId] = useScreenState(selectedWordIdState);
    const [detailReturnView] = useScreenState(detailReturnViewState);
    const goBack = () => { setSelectedWordId(null); navigate(detailReturnView); };
    const card = cards.find((item) => item.id === selectedWordId);
    if (!card) {
        return <section className="surface-panel"><p className="stats-empty">This word is no longer available.</p><button className="ghost-button" onClick={goBack}>Back</button></section>;
    }
    const wordLogs = logs.filter((log) => log.wordId === card.id).sort((first, second) => new Date(second.reviewedAt).getTime() - new Date(first.reviewedAt).getTime());
    const successfulReviews = wordLogs.filter((log) => log.rating !== "forgot").length;
    const successRate = wordLogs.length ? Math.round((successfulReviews / wordLogs.length) * 100) : 0;
    const folderName = folders.find((folder) => sameId(folder.id, card.folderId))?.name ?? "Unsorted";
    return <section className="word-detail-page"><button className="ghost-button" onClick={goBack}><ArrowLeft size={14} /> Back</button><div className="word-detail-hero surface-panel"><div><div className="eyebrow">{card.sourceLanguage} · {folderName}</div><h2>{card.word}</h2><p>{card.meaning || "Meaning to be added"}</p></div><button type="button" className="speaker-button detail-speaker" onClick={() => speakWord(card.word, card.sourceLanguage)} aria-label={`Pronounce ${card.word}`}><Volume2 size={19} /></button></div><div className="word-detail-grid"><section className="surface-panel"><div className="panel-heading"><h2>Progress</h2><BarChart3 size={17} color="var(--sage)" /></div><div className="detail-stat-list"><div><span>Success rate</span><strong>{wordLogs.length ? `${successRate}%` : "No reviews yet"}</strong></div><div><span>Reviews</span><strong>{wordLogs.length}</strong></div><div><span>Next review</span><strong><DueIn dueAt={card.dueAt} /></strong></div><div><span>Current state</span><strong>{card.state}</strong></div></div></section><section className="surface-panel"><div className="panel-heading"><h2>Context</h2><Pencil size={16} color="var(--sage)" /></div><div className="detail-copy"><div><span className="mono-label">Example sentence</span><p>{card.exampleSentence || "No example sentence yet."}</p></div><div><span className="mono-label">Notes</span><p>{card.notes || "No notes yet."}</p></div></div></section></div><section className="surface-panel"><div className="panel-heading"><div><h2>Review history</h2><p className="panel-subtitle">Your recent attempts with this word</p></div><button className="ghost-button detail-edit-button" onClick={() => openEditWord(card)}><Pencil size={14} /> Edit word</button></div>{wordLogs.length ? <div className="review-history">{wordLogs.map((log) => <div className="review-history-row" key={log.id}><span>{new Date(log.reviewedAt).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}</span><strong className={`history-rating ${log.rating}`}>{ratingLabels[log.rating]}</strong></div>)}</div> : <p className="stats-empty">Review this word to start building its history.</p>}</section></section>;
}
