import { useState } from "react";
import { BookOpenCheck, Loader2, Network, Sparkles } from "lucide-react";
import { translationSaveKey, TranslationItems, type Relation, type SaveState } from "@/components/translate/translation-items";
import { useAppData } from "@/context/app-data-context";
import { requestRelatedWord, requestWordFamily, type TranslationItem } from "@/lib/api-client";
import { grammarLanguages, hasGrammarForms } from "@/lib/grammar-languages";
import { insertWord, saveWordFamily } from "@/lib/supabase/data";
import type { WordRecord } from "@/lib/types";

const relationLabels: Record<Relation, string> = { family: "Word family", synonym: "Synonym", antonym: "Antonym" };

// What the AI stored for this word: article, plural and tenses. Filled in while the word comes up in reviews.
export function GrammarCard({ card }: { card: WordRecord }) {
    if (!hasGrammarForms(card.sourceLanguage)) return null;
    const grammar = grammarLanguages[card.sourceLanguage];
    const forms = card.forms;
    const rows: Array<[string, string | undefined]> = forms ? [
        ["Article", forms.article ? `${forms.article}${forms.gender ? ` (${forms.gender})` : ""}` : undefined],
        ["Plural", forms.plural],
        [grammar.perfect, forms.perfect],
        [grammar.pastSimple, forms.pastSimple],
        ["Separable prefix", forms.separablePrefix],
    ] : [];
    const visible = rows.filter((row): row is [string, string] => Boolean(row[1]));
    return <section className="surface-panel">
        <div className="panel-heading"><div><h2>Grammar</h2><p className="panel-subtitle">Forms you are quizzed on in reviews</p></div><BookOpenCheck size={17} color="var(--sage)" /></div>
        {!forms
            ? <p className="stats-empty">Grammar data is added automatically when this word comes up in your review.</p>
            : visible.length || forms.inflected?.length
                ? <div className="detail-stat-list">
                    {visible.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
                    {forms.inflected?.length ? <div style={{ gridColumn: "1 / -1" }}><span>Other forms</span><strong className="grammar-forms">{forms.inflected.join(", ")}</strong></div> : null}
                </div>
                : <p className="stats-empty">No grammar forms apply to this word.</p>}
    </section>;
}

// Word family, synonyms and antonyms for a saved word, each one tap away from becoming a card.
export function RelatedWords({ card }: { card: WordRecord }) {
    const { cards, setCards, setSyncStatus, getCloudContext } = useAppData();
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState("");
    const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
    const related = card.wordFamily;

    async function findRelated() {
        setLoading(true);
        setStatus("");
        try {
            const family = await requestWordFamily({ word: card.word, meaning: card.meaning, sourceLanguage: card.sourceLanguage, targetLanguage: card.targetLanguage });
            setCards((previous) => previous.map((item) => item.id === card.id ? { ...item, wordFamily: family } : item));
            const cloud = getCloudContext();
            if (cloud) await saveWordFamily(cloud.client, cloud.userId, cloud.workspaceId, card.id, family).catch(() => undefined);
        } catch (error) {
            setStatus(error instanceof Error ? error.message : "Could not find related words.");
        } finally {
            setLoading(false);
        }
    }

    async function addItem(item: TranslationItem, relation: Relation) {
        const key = translationSaveKey(item.word, relation);
        if (saveStates[key]) return;
        const exists = cards.some((existing) => existing.word.trim().toLocaleLowerCase() === item.word.trim().toLocaleLowerCase() && existing.sourceLanguage === card.sourceLanguage && existing.targetLanguage === card.targetLanguage);
        if (exists) {
            setSaveStates((previous) => ({ ...previous, [key]: "saved" }));
            setStatus(`"${item.word}" is already in your vocabulary.`);
            return;
        }
        const cloud = getCloudContext();
        if (!cloud) {
            setStatus("Supabase is required to save a word.");
            return;
        }
        setSaveStates((previous) => ({ ...previous, [key]: "saving" }));
        try {
            const data = await requestRelatedWord({ sourceLanguage: card.sourceLanguage, targetLanguage: card.targetLanguage, word: item.word, meaning: item.translation, relation });
            const input = {
                word: item.word.trim(),
                meaning: data.meaning?.trim() || item.translation,
                exampleSentence: data.sourceExample.trim(),
                folderId: card.folderId,
                sourceLanguage: card.sourceLanguage,
                targetLanguage: card.targetLanguage,
                cefrLevel: data.cefrLevel,
                notes: `${relationLabels[relation]} of ${card.word}`,
            };
            setSyncStatus("Saving related word...");
            const created = await insertWord(cloud.client, cloud.userId, cloud.workspaceId, input);
            setCards((previous) => [{ ...input, id: created.id, createdAt: created.createdAt, state: "new", stability: 0.25, difficulty: 5, dueAt: created.createdAt, reps: 0, lapses: 0 }, ...previous]);
            setSyncStatus("Synced");
            setSaveStates((previous) => ({ ...previous, [key]: "saved" }));
        } catch (error) {
            setStatus(error instanceof Error ? error.message : "Related word could not be saved.");
            setSaveStates((previous) => {
                const next = { ...previous };
                delete next[key];
                return next;
            });
        }
    }

    const saving = (relation: Relation) => ({ relation, saveStates, onSave: (item: TranslationItem, itemRelation: Relation) => void addItem(item, itemRelation) });
    return <section className="surface-panel">
        <div className="panel-heading"><div><h2>Related words</h2><p className="panel-subtitle">Connected words are easier to remember. Tap + to add one as a card.</p></div><Network size={17} color="var(--sage)" /></div>
        {!related
            ? <button type="button" className="ghost-button" onClick={() => void findRelated()} disabled={loading}>{loading ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />} {loading ? "Looking..." : "Find related words"}</button>
            : <div className="related-groups">
                <div><span className="mono-label">Word family</span><TranslationItems items={related.family} emptyLabel="No family words found." related={saving("family")} /></div>
                <div><span className="mono-label">Synonyms</span><TranslationItems items={related.synonyms} emptyLabel="No synonyms found." related={saving("synonym")} /></div>
                <div><span className="mono-label">Antonyms</span><TranslationItems items={related.antonyms} emptyLabel="No antonyms found." related={saving("antonym")} /></div>
            </div>}
        {status && <p className="form-note">{status}</p>}
    </section>;
}
