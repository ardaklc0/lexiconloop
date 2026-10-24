import { Fragment, useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpen, Check, CirclePlus, Eye, EyeOff, Loader2, Sparkles, Volume2, X } from "lucide-react";
import { SentenceCoach } from "@/components/review/sentence-coach";
import { useAppData } from "@/context/app-data-context";
import { requestStory, requestWordDetails } from "@/lib/api-client";
import { speakWord } from "@/lib/speech";
import { pickStoryWordGroups } from "@/lib/story-words";
import { buildGapQuestions, highlightRanges, sentenceAt, splitWords } from "@/lib/story-text";
import { insertWord } from "@/lib/supabase/data";
import type { CefrLevel, Story, StoryFormat } from "@/lib/types";

const formatLabels: Record<StoryFormat, string> = { story: "Story", dialogue: "Dialogue", email: "Email", diary: "Diary entry", news: "News article" };
const MAX_HISTORY = 5;
const MIN_WORDS = 3;
const MAX_WORDS = 10;
const DEFAULT_WORDS = 8;

const historyKey = (workspaceId: string, language: string) => `lexicon-loop-stories:${workspaceId}:${language}`;

type Lookup = { token: string; sentence: string; status: "loading" | "ready" | "error"; meaning?: string; cefrLevel?: CefrLevel; message?: string; existing?: boolean; added?: boolean };

const formatDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short" }) : "");

export function StoryScreen({ onClose }: { onClose: () => void }) {
    const { cards, setCards, logs, workspaceId, setSyncStatus, getCloudContext } = useAppData();
    const groups = useMemo(() => pickStoryWordGroups(cards, logs), [cards, logs]);
    const [language, setLanguage] = useState(groups[0]?.sourceLanguage ?? "");
    const group = groups.find((item) => item.sourceLanguage === language) ?? groups[0];
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [format, setFormat] = useState<StoryFormat>("story");
    const [topic, setTopic] = useState("");
    const [history, setHistory] = useState<Story[]>([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [openWord, setOpenWord] = useState<number | null>(null);
    const [lookup, setLookup] = useState<Lookup | null>(null);
    const [answers, setAnswers] = useState<Record<number, string>>({});
    const [showTranslation, setShowTranslation] = useState(false);
    const story = history[activeIndex] ?? null;

    const languageKey = group?.sourceLanguage ?? "";
    // Words offered for this language; the first few are chosen, the learner can swap them.
    useEffect(() => {
        const first = groups.find((item) => item.sourceLanguage === languageKey);
        setSelectedIds(first ? first.words.slice(0, DEFAULT_WORDS).map((card) => card.id) : []);
        // Only when the language changes, not every time the review data refreshes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [languageKey]);

    // The last few texts per language stay on the device, so reopening one costs no new request.
    useEffect(() => {
        setActiveIndex(0);
        setAnswers({});
        setOpenWord(null);
        setLookup(null);
        setShowTranslation(false);
        if (!languageKey) {
            setHistory([]);
            return;
        }
        try {
            const saved = window.localStorage.getItem(historyKey(workspaceId, languageKey));
            setHistory(saved ? (JSON.parse(saved) as Story[]) : []);
        } catch {
            window.localStorage.removeItem(historyKey(workspaceId, languageKey));
            setHistory([]);
        }
    }, [languageKey, workspaceId]);

    function select(index: number) {
        setActiveIndex(index);
        setAnswers({});
        setOpenWord(null);
        setLookup(null);
        setShowTranslation(false);
    }

    function toggleWord(id: string) {
        setSelectedIds((previous) => previous.includes(id) ? previous.filter((item) => item !== id) : previous.length >= MAX_WORDS ? previous : [...previous, id]);
    }

    async function write() {
        if (!group || loading || selectedIds.length < MIN_WORDS) return;
        setLoading(true);
        setError("");
        try {
            const chosen = group.words.filter((card) => selectedIds.includes(card.id));
            const next = await requestStory({
                sourceLanguage: group.sourceLanguage,
                feedbackLanguage: group.targetLanguage,
                cefrLevel: group.cefrLevel,
                format,
                topic: topic.trim() || undefined,
                words: chosen.map((card) => ({ word: card.word, meaning: card.meaning })),
            });
            const updated = [next, ...history].slice(0, MAX_HISTORY);
            setHistory(updated);
            window.localStorage.setItem(historyKey(workspaceId, group.sourceLanguage), JSON.stringify(updated));
            select(0);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Could not write the text.");
        } finally {
            setLoading(false);
        }
    }

    async function openLookup(token: string, start: number, end: number) {
        if (!story || !group) return;
        const sentence = sentenceAt(story.text, start, end).text;
        setOpenWord(null);
        const existing = cards.some((card) => card.word.trim().toLocaleLowerCase() === token.toLocaleLowerCase() && card.sourceLanguage === group.sourceLanguage);
        setLookup({ token, sentence, status: "loading", existing });
        try {
            const details = await requestWordDetails({ word: token, sourceLanguage: group.sourceLanguage, targetLanguage: group.targetLanguage });
            setLookup((current) => current?.token === token ? { ...current, status: "ready", meaning: details.meaning, cefrLevel: details.cefrLevel } : current);
        } catch (caught) {
            setLookup((current) => current?.token === token ? { ...current, status: "error", message: caught instanceof Error ? caught.message : "Could not look this word up." } : current);
        }
    }

    // The story sentence becomes the card's example, so the new word is learned in the context it was met in.
    async function addLookup() {
        if (!story || !group || !lookup || lookup.status !== "ready" || lookup.added || lookup.existing) return;
        const cloud = getCloudContext();
        if (!cloud) {
            setLookup({ ...lookup, status: "error", message: "Supabase is required to save a word." });
            return;
        }
        const input = {
            word: lookup.token,
            meaning: lookup.meaning ?? "",
            exampleSentence: lookup.sentence,
            folderId: "",
            sourceLanguage: group.sourceLanguage,
            targetLanguage: group.targetLanguage,
            cefrLevel: lookup.cefrLevel,
            notes: `From “${story.title}”`,
        };
        try {
            setSyncStatus("Saving word...");
            const created = await insertWord(cloud.client, cloud.userId, cloud.workspaceId, input);
            setCards((previous) => [{ ...input, id: created.id, createdAt: created.createdAt, state: "new", stability: 0.25, difficulty: 5, dueAt: created.createdAt, reps: 0, lapses: 0 }, ...previous]);
            setSyncStatus("Synced");
            setLookup((current) => current ? { ...current, added: true } : current);
        } catch (caught) {
            setLookup((current) => current ? { ...current, status: "error", message: caught instanceof Error ? caught.message : "Word could not be saved." } : current);
        }
    }

    const ranges = useMemo(() => (story ? highlightRanges(story) : []), [story]);
    // Multiple-choice questions from the AI plus fill-the-gap questions built from the text itself.
    const questions = useMemo(() => (story ? [...story.questions, ...buildGapQuestions(story, 2)] : []), [story]);
    const answered = questions.filter((_, index) => answers[index] !== undefined).length;
    const correct = questions.filter((item, index) => answers[index] === item.answer).length;
    const selected = story && openWord !== null ? story.highlights[openWord] : null;
    const coachCard = story ? cards.find((card) => card.sourceLanguage === story.sourceLanguage && story.highlights.some((item) => item.word === card.word)) : undefined;

    const body = () => {
        if (!story) return null;
        const parts: Array<{ key: string; node: React.ReactNode }> = [];
        const pushWords = (from: number, to: number) => {
            let position = from;
            splitWords(story.text.slice(from, to)).forEach((part) => {
                const start = position;
                position += part.text.length;
                parts.push({
                    key: `w${start}`,
                    node: part.word
                        ? <button type="button" className={`story-token ${lookup?.token === part.text && lookup.sentence === sentenceAt(story.text, start, position).text ? "active" : ""}`} onClick={() => void openLookup(part.text, start, position)}>{part.text}</button>
                        : part.text,
                });
            });
        };
        let cursor = 0;
        ranges.forEach((range) => {
            if (range.start > cursor) pushWords(cursor, range.start);
            parts.push({
                key: `h${range.start}`,
                node: <button type="button" className={`story-word ${openWord === range.highlight ? "active" : ""}`} onClick={() => { setLookup(null); setOpenWord(openWord === range.highlight ? null : range.highlight); }}>{story.text.slice(range.start, range.end)}</button>,
            });
            cursor = range.end;
        });
        if (cursor < story.text.length) pushWords(cursor, story.text.length);
        return parts.map((part) => <Fragment key={part.key}>{part.node}</Fragment>);
    };

    return <section className="quiz-page story-page">
        <button className="ghost-button quiz-back-button" onClick={onClose}><ArrowLeft size={14} /> Back to review</button>
        <div className="quiz-intro surface-panel story-intro">
            <div><div className="eyebrow">Reading practice</div><h2>Your words in context</h2><p>A short text built from words you reviewed this week. Tap a highlighted word for its meaning, or any other word to add it to your vocabulary.</p></div>
            {group && <div className="story-config">
                <div className="story-config-row">
                    {groups.length > 1 && <label>Language<select value={group.sourceLanguage} onChange={(event) => setLanguage(event.target.value)}>{groups.map((item) => <option key={item.sourceLanguage} value={item.sourceLanguage}>{item.sourceLanguage}</option>)}</select></label>}
                    <label>Format<select value={format} onChange={(event) => setFormat(event.target.value as StoryFormat)}>{(Object.keys(formatLabels) as StoryFormat[]).map((item) => <option key={item} value={item}>{formatLabels[item]}</option>)}</select></label>
                    <label>Topic (optional)<input value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={60} placeholder="e.g. at the airport" /></label>
                </div>
                <div><span className="mono-label">Words ({selectedIds.length} of {MAX_WORDS} max, at least {MIN_WORDS})</span>
                    <div className="story-chips">{group.words.map((card) => <button type="button" key={card.id} className={`story-chip ${selectedIds.includes(card.id) ? "on" : ""}`} aria-pressed={selectedIds.includes(card.id)} onClick={() => toggleWord(card.id)}>{card.word}</button>)}</div>
                </div>
                <button type="button" className="primary-button" onClick={() => void write()} disabled={loading || selectedIds.length < MIN_WORDS}>{loading ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />} {story ? "Write a new one" : "Write my text"}</button>
            </div>}
        </div>
        {history.length > 1 && <div className="story-history" aria-label="Earlier texts">{history.map((item, index) => <button type="button" key={item.createdAt ?? index} className={`story-chip ${index === activeIndex ? "on" : ""}`} onClick={() => select(index)}>{item.title} · {formatDate(item.createdAt)}</button>)}</div>}
        {!group && <div className="quiz-empty surface-panel"><BookOpen size={30} /><h2>Review a few more words first</h2><p>A text needs at least three words you have already reviewed in the same language.</p></div>}
        {group && !story && !loading && !error && <div className="quiz-empty surface-panel"><BookOpen size={30} /><h2>{group.words.length} words are ready</h2><p>Pick the words above, then write your text.</p></div>}
        {loading && <div className="quiz-empty surface-panel"><Loader2 size={30} className="spin" /><h2>Writing your text...</h2><p>This takes a few seconds.</p></div>}
        {error && <div className="form-note" role="alert">{error}</div>}
        {story && !loading && <>
            <article className="story-card surface-panel">
                <div className="story-head"><h2>{story.title}</h2><span className="story-level">{story.cefrLevel}{story.format && story.format !== "story" ? ` · ${formatLabels[story.format]}` : ""}</span></div>
                <p className="story-text">{body()}</p>
                {selected && <div className="story-meaning" role="status"><div><strong>{selected.word}</strong><span>{selected.meaning || "No meaning saved"}</span></div><button type="button" className="speaker-button" onClick={() => speakWord(selected.word, story.sourceLanguage)} aria-label={`Pronounce ${selected.word}`}><Volume2 size={16} /></button></div>}
                {lookup && <div className="story-meaning story-lookup" role="status">
                    <div><strong>{lookup.token}</strong>{lookup.status === "loading" ? <span>Looking it up...</span> : lookup.status === "error" ? <span className="sentence-error">{lookup.message}</span> : <span>{lookup.meaning || "No meaning found"}{lookup.cefrLevel ? ` · ${lookup.cefrLevel}` : ""}</span>}</div>
                    {lookup.status === "ready" && (lookup.existing ? <span className="story-added">In your words</span> : lookup.added ? <span className="story-added"><Check size={14} /> Added</span> : <button type="button" className="ghost-button" onClick={() => void addLookup()}><CirclePlus size={14} /> Add</button>)}
                    <button type="button" className="icon-button" onClick={() => setLookup(null)} aria-label="Close"><X size={14} /></button>
                </div>}
                {story.translation && <div className="story-translation">
                    <button type="button" className="ghost-button" onClick={() => setShowTranslation((value) => !value)}>{showTranslation ? <EyeOff size={14} /> : <Eye size={14} />} {showTranslation ? "Hide translation" : "Show translation"}</button>
                    {showTranslation && <p className="story-text story-translated">{story.translation}</p>}
                </div>}
            </article>
            {questions.length > 0 && <section className="story-questions surface-panel">
                <div className="panel-heading"><div><h2>Did you understand it?</h2><p className="panel-subtitle">{answered === questions.length ? `${correct} of ${questions.length} correct` : `${answered} of ${questions.length} answered`}</p></div></div>
                {questions.map((item, index) => {
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
            {coachCard && <section className="surface-panel">
                <div className="panel-heading"><div><h2>Now write your own</h2><p className="panel-subtitle">Write one sentence about the text and get feedback</p></div></div>
                <SentenceCoach key={`${story.createdAt}-${coachCard.id}`} card={coachCard} />
            </section>}
        </>}
    </section>;
}
