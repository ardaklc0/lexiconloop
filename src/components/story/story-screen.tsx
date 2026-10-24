import { Fragment, useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpen, Check, Loader2, Sparkles, Volume2, X } from "lucide-react";
import { useAppData } from "@/context/app-data-context";
import { requestStory } from "@/lib/api-client";
import { speakWord } from "@/lib/speech";
import { pickStoryWordGroups } from "@/lib/story-words";
import { findWordInText } from "@/lib/typed-answer";
import type { Story } from "@/lib/types";

const today = () => new Date().toISOString().slice(0, 10);

type Range = { start: number; end: number; highlight: number };

// Every occurrence of every highlighted word, without overlaps, in text order.
function highlightRanges(story: Story): Range[] {
    const ranges: Range[] = [];
    story.highlights.forEach((highlight, index) => {
        let offset = 0;
        for (;;) {
            const found = findWordInText(story.text.slice(offset), highlight.surface);
            if (!found) break;
            ranges.push({ start: offset + found.start, end: offset + found.end, highlight: index });
            offset += found.end;
        }
    });
    ranges.sort((first, second) => first.start - second.start);
    return ranges.filter((range, index) => index === 0 || range.start >= ranges[index - 1].end);
}

export function StoryScreen({ onClose }: { onClose: () => void }) {
    const { cards, logs, workspaceId } = useAppData();
    const groups = useMemo(() => pickStoryWordGroups(cards, logs), [cards, logs]);
    const [language, setLanguage] = useState(groups[0]?.sourceLanguage ?? "");
    const group = groups.find((item) => item.sourceLanguage === language) ?? groups[0];
    const [story, setStory] = useState<Story | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [openWord, setOpenWord] = useState<number | null>(null);
    const [answers, setAnswers] = useState<Record<number, string>>({});

    const cacheKey = group ? `lexicon-loop-story:${workspaceId}:${group.sourceLanguage}:${today()}` : "";
    // One story per language and day is kept on the device, so reopening it costs no new request.
    useEffect(() => {
        setStory(null);
        setAnswers({});
        setOpenWord(null);
        if (!cacheKey) return;
        try {
            const cached = window.localStorage.getItem(cacheKey);
            if (cached) setStory(JSON.parse(cached) as Story);
        } catch {
            window.localStorage.removeItem(cacheKey);
        }
    }, [cacheKey]);

    async function write() {
        if (!group || loading) return;
        setLoading(true);
        setError("");
        try {
            const next = await requestStory({
                sourceLanguage: group.sourceLanguage,
                feedbackLanguage: group.targetLanguage,
                cefrLevel: group.cefrLevel,
                words: group.words.map((card) => ({ word: card.word, meaning: card.meaning })),
            });
            setStory(next);
            setAnswers({});
            setOpenWord(null);
            window.localStorage.setItem(cacheKey, JSON.stringify(next));
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Could not write a story.");
        } finally {
            setLoading(false);
        }
    }

    const ranges = useMemo(() => (story ? highlightRanges(story) : []), [story]);
    const answered = story ? story.questions.filter((_, index) => answers[index] !== undefined).length : 0;
    const correct = story ? story.questions.filter((item, index) => answers[index] === item.answer).length : 0;
    const selected = story && openWord !== null ? story.highlights[openWord] : null;

    const body = () => {
        if (!story) return null;
        let cursor = 0;
        const parts: Array<{ key: string; node: React.ReactNode }> = [];
        ranges.forEach((range) => {
            if (range.start > cursor) parts.push({ key: `t${cursor}`, node: story.text.slice(cursor, range.start) });
            parts.push({
                key: `h${range.start}`,
                node: <button type="button" className={`story-word ${openWord === range.highlight ? "active" : ""}`} onClick={() => setOpenWord(openWord === range.highlight ? null : range.highlight)}>{story.text.slice(range.start, range.end)}</button>,
            });
            cursor = range.end;
        });
        if (cursor < story.text.length) parts.push({ key: `t${cursor}`, node: story.text.slice(cursor) });
        return parts.map((part) => <Fragment key={part.key}>{part.node}</Fragment>);
    };

    return <section className="quiz-page story-page">
        <button className="ghost-button quiz-back-button" onClick={onClose}><ArrowLeft size={14} /> Back to review</button>
        <div className="quiz-intro surface-panel">
            <div><div className="eyebrow">Reading practice</div><h2>Your words in a story</h2><p>A short text built from words you reviewed this week. Tap a highlighted word to see its meaning.</p></div>
            {group && <div className="quiz-settings">
                {groups.length > 1 && <label>Language<select value={group.sourceLanguage} onChange={(event) => setLanguage(event.target.value)}>{groups.map((item) => <option key={item.sourceLanguage} value={item.sourceLanguage}>{item.sourceLanguage}</option>)}</select></label>}
                <button type="button" className="primary-button" onClick={() => void write()} disabled={loading}>{loading ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />} {story ? "New story" : "Write my story"}</button>
            </div>}
        </div>
        {!group && <div className="quiz-empty surface-panel"><BookOpen size={30} /><h2>Review a few more words first</h2><p>A story needs at least three words you have already reviewed in the same language.</p></div>}
        {group && !story && !loading && !error && <div className="quiz-empty surface-panel"><BookOpen size={30} /><h2>{group.words.length} words are ready</h2><p>{group.words.map((card) => card.word).join(", ")}</p></div>}
        {loading && <div className="quiz-empty surface-panel"><Loader2 size={30} className="spin" /><h2>Writing your story...</h2><p>This takes a few seconds.</p></div>}
        {error && <div className="form-note" role="alert">{error}</div>}
        {story && !loading && <>
            <article className="story-card surface-panel">
                <div className="story-head"><h2>{story.title}</h2><span className="story-level">{story.cefrLevel}</span></div>
                <p className="story-text">{body()}</p>
                {selected && <div className="story-meaning" role="status"><div><strong>{selected.word}</strong><span>{selected.meaning || "No meaning saved"}</span></div><button type="button" className="speaker-button" onClick={() => speakWord(selected.word, story.sourceLanguage)} aria-label={`Pronounce ${selected.word}`}><Volume2 size={16} /></button></div>}
            </article>
            {story.questions.length > 0 && <section className="story-questions surface-panel">
                <div className="panel-heading"><div><h2>Did you understand it?</h2><p className="panel-subtitle">{answered === story.questions.length ? `${correct} of ${story.questions.length} correct` : `${answered} of ${story.questions.length} answered`}</p></div></div>
                {story.questions.map((item, index) => {
                    const chosen = answers[index];
                    return <div className="story-question" key={item.question}>
                        <strong>{index + 1}. {item.question}</strong>
                        <div className="story-options">{item.options.map((option) => {
                            const state = chosen === undefined ? "" : option === item.answer ? "right" : option === chosen ? "wrong" : "dim";
                            return <button type="button" key={option} className={`story-option ${state}`} disabled={chosen !== undefined} onClick={() => setAnswers((previous) => ({ ...previous, [index]: option }))}>{state === "right" ? <Check size={14} /> : state === "wrong" ? <X size={14} /> : null}{option}</button>;
                        })}</div>
                        {chosen !== undefined && item.explanation && <p className="story-explanation">{item.explanation}</p>}
                    </div>;
                })}
            </section>}
        </>}
    </section>;
}
