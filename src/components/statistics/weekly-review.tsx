import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, Loader2, Sparkles } from "lucide-react";
import { useAppData } from "@/context/app-data-context";
import { requestWeeklySummary } from "@/lib/api-client";
import { loadRecentAttempts, loadWeeklySummary, saveWeeklySummary, type RecentGrammarAttempt, type RecentSentenceAttempt } from "@/lib/supabase/data";
import { computeWeeklyStats, currentWeekKey, weekWindowStart, type WeeklySummary } from "@/lib/weekly-stats";

const kindLabels: Record<string, string> = { article: "Articles", plural: "Plurals", perfect: "Perfect tense", pastSimple: "Simple past", prefix: "Separable prefixes" };

// The numbers are always computed locally; the AI only adds the coaching text, once a week unless refreshed.
export function WeeklyReview() {
    const { cards, logs, workspaceId, getCloudContext } = useAppData();
    const [grammar, setGrammar] = useState<RecentGrammarAttempt[]>([]);
    const [sentences, setSentences] = useState<RecentSentenceAttempt[]>([]);
    const [summary, setSummary] = useState<WeeklySummary | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const weekKey = currentWeekKey(new Date());

    useEffect(() => {
        const cloud = getCloudContext();
        if (!cloud) return;
        let active = true;
        void Promise.all([
            loadRecentAttempts(cloud.client, cloud.userId, cloud.workspaceId, weekWindowStart(new Date()).toISOString()),
            loadWeeklySummary<WeeklySummary>(cloud.client, cloud.userId, cloud.workspaceId, weekKey),
        ]).then(([attempts, saved]) => {
            if (!active) return;
            setGrammar(attempts.grammar);
            setSentences(attempts.sentences);
            setSummary(saved);
        }).catch(() => undefined);
        return () => { active = false; };
    }, [getCloudContext, weekKey, workspaceId]);

    const stats = useMemo(() => computeWeeklyStats(cards, logs, grammar, sentences), [cards, logs, grammar, sentences]);
    const feedbackLanguage = useMemo(() => {
        const counts = new Map<string, number>();
        cards.forEach((card) => counts.set(card.targetLanguage, (counts.get(card.targetLanguage) ?? 0) + 1));
        return Array.from(counts.entries()).sort((first, second) => second[1] - first[1])[0]?.[0] ?? "English";
    }, [cards]);

    async function generate() {
        setLoading(true);
        setError("");
        try {
            const next = await requestWeeklySummary({ stats, feedbackLanguage });
            setSummary(next);
            const cloud = getCloudContext();
            if (cloud) await saveWeeklySummary(cloud.client, cloud.userId, cloud.workspaceId, weekKey, next).catch(() => undefined);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Could not write the weekly summary.");
        } finally {
            setLoading(false);
        }
    }

    const hasActivity = stats.reviews > 0 || stats.sentenceAttempts > 0;
    return <section className="surface-panel weekly-review">
        <div className="panel-heading"><div><h2>Your week</h2><p className="panel-subtitle">The last 7 days</p></div><CalendarCheck size={17} color="var(--sage)" /></div>
        {!hasActivity ? <p className="stats-empty">Review a few cards and your weekly summary appears here.</p> : <>
            <div className="weekly-numbers">
                <div><strong>{stats.reviews}</strong><span>reviews</span></div>
                <div><strong>{stats.accuracy === null ? "-" : `${stats.accuracy}%`}</strong><span>remembered</span></div>
                <div><strong>{stats.activeDays}/7</strong><span>active days</span></div>
                <div><strong>{stats.wordsAdded}</strong><span>new words</span></div>
                {stats.typedTotal > 0 && <div><strong>{stats.typedAccuracy === null ? "-" : `${stats.typedAccuracy}%`}</strong><span>typed right</span></div>}
            </div>
            {stats.grammarKinds.length > 0 && <div className="weekly-block"><span className="mono-label">Grammar questions</span>{stats.grammarKinds.map((item) => <div className="weekly-row" key={item.kind}><span>{kindLabels[item.kind] ?? item.kind}</span><strong>{item.asked - item.wrong} of {item.asked} right</strong></div>)}</div>}
            {stats.sentenceErrorTypes.length > 0 && <div className="weekly-block"><span className="mono-label">Mistakes in your sentences</span>{stats.sentenceErrorTypes.map((item) => <div className="weekly-row" key={item.type}><span>{item.type}</span><strong>{item.count}</strong></div>)}</div>}
            {stats.hardestWords.length > 0 && <div className="weekly-block"><span className="mono-label">Forgotten most</span>{stats.hardestWords.map((item) => <div className="weekly-row" key={item.word}><span>{item.word}</span><strong>{item.forgotten}×</strong></div>)}</div>}
            {summary
                ? <div className="weekly-coach">
                    <strong>{summary.headline}</strong>
                    {summary.highlights.length > 0 && <ul>{summary.highlights.map((line) => <li key={line}>{line}</li>)}</ul>}
                    {summary.patterns.length > 0 && <><span className="mono-label">Patterns</span><ul>{summary.patterns.map((line) => <li key={line}>{line}</li>)}</ul></>}
                    {summary.focus.length > 0 && <><span className="mono-label">Next week</span><ul>{summary.focus.map((line) => <li key={line}>{line}</li>)}</ul></>}
                </div>
                : null}
            <button type="button" className="ghost-button weekly-button" onClick={() => void generate()} disabled={loading}>{loading ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />} {summary ? "Refresh coaching" : "Get AI coaching"}</button>
            {error && <p className="form-note" role="alert">{error}</p>}
        </>}
    </section>;
}
