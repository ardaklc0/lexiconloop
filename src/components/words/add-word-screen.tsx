import { Check, Sparkles, X } from "lucide-react";
import { useAppData } from "@/context/app-data-context";
import { editingWordIdState, generationStatusState, useNavigation, wordFormState } from "@/context/navigation-context";
import { screenState, useScreenState } from "@/hooks/use-screen-state";
import { requestWordDetails } from "@/lib/api-client";
import { cefrLevels, languageOptions } from "@/lib/constants";
import { makeId } from "@/lib/ids";
import { insertWord, updateWord } from "@/lib/supabase/data";
import type { CefrLevel, WordRecord } from "@/lib/types";

const generatingState = screenState("add-word.generating", false);

export function AddWordScreen() {
    const { cards, setCards, folders, setSyncStatus, getCloudContext } = useAppData();
    const { navigate, returnView } = useNavigation();
    const [form, setForm] = useScreenState(wordFormState);
    const [editingWordId] = useScreenState(editingWordIdState);
    const [generationStatus, setGenerationStatus] = useScreenState(generationStatusState);
    const [generating, setGenerating] = useScreenState(generatingState);

    async function addWord(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!form.word.trim()) return;
        const now = new Date().toISOString();
        const cloud = getCloudContext();
        if (editingWordId) {
            const previous = cards.find((card) => card.id === editingWordId);
            if (!previous) return;
            const formsOutdated = previous.word !== form.word.trim() || previous.sourceLanguage !== form.sourceLanguage;
            const updated = { ...previous, forms: formsOutdated ? undefined : previous.forms, word: form.word.trim(), meaning: form.meaning.trim(), exampleSentence: form.exampleSentence.trim() || undefined, folderId: form.folderId, sourceLanguage: form.sourceLanguage, targetLanguage: form.targetLanguage, cefrLevel: form.cefrLevel || undefined, notes: form.notes.trim() || undefined };
            setCards((items) => items.map((card) => card.id === editingWordId ? updated : card));
            navigate(returnView);
            if (cloud) {
                setSyncStatus("Saving changes...");
                try {
                    await updateWord(cloud.client, cloud.userId, cloud.workspaceId, editingWordId, { ...updated, resetForms: formsOutdated });
                    setSyncStatus("Synced");
                } catch (error) {
                    setCards((items) => items.map((card) => card.id === editingWordId ? previous : card));
                    setSyncStatus(error instanceof Error ? error.message : "Word could not be updated.");
                }
            } else {
                setSyncStatus("Saved locally");
            }
            return;
        }
        let wordId = makeId();
        let createdAt = now;

        try {
            if (cloud) {
                setSyncStatus("Saving word...");
                const created = await insertWord(cloud.client, cloud.userId, cloud.workspaceId, {
                    word: form.word.trim(),
                    meaning: form.meaning.trim(),
                    exampleSentence: form.exampleSentence.trim() || undefined,
                    folderId: form.folderId,
                    sourceLanguage: form.sourceLanguage,
                    targetLanguage: form.targetLanguage,
                    cefrLevel: form.cefrLevel || undefined,
                    notes: form.notes.trim() || undefined,
                });
                wordId = created.id;
                createdAt = created.createdAt;
            }

            const newCard: WordRecord = {
                id: wordId, word: form.word.trim(), meaning: form.meaning.trim(), exampleSentence: form.exampleSentence.trim() || undefined,
                folderId: form.folderId, sourceLanguage: form.sourceLanguage, targetLanguage: form.targetLanguage, cefrLevel: form.cefrLevel || undefined, notes: form.notes.trim() || undefined,
                createdAt, state: "new", stability: .25, difficulty: 5, dueAt: now, reps: 0, lapses: 0,
            };
            setCards((previous) => [newCard, ...previous]);
            navigate("words");
            setSyncStatus(cloud ? "Synced" : "Saved locally");
        } catch (error) {
            setSyncStatus(error instanceof Error ? error.message : "Word could not be saved.");
        }
    }

    async function generateSentence() {
        if (!form.word.trim()) return;
        setGenerating(true);
        try {
            const data = await requestWordDetails({ word: form.word, sourceLanguage: form.sourceLanguage, targetLanguage: form.targetLanguage });
            setForm((previous) => ({ ...previous, meaning: data.meaning ?? "", exampleSentence: data.sentence ?? "", cefrLevel: data.cefrLevel ?? "" }));
            setGenerationStatus("AI content ready to edit.");
        } catch (error) {
            setGenerationStatus(error instanceof Error ? error.message : "Could not generate word information.");
        } finally {
            setGenerating(false);
        }
    }

    return (
        <div className="modal add-word-page" role="region" aria-labelledby="add-word-title">
            <div className="modal-header">
                <div><div className="eyebrow">New vocabulary</div><h2 id="add-word-title">{editingWordId ? "Edit word" : "Add a word"}</h2><p>Give it just enough context to stick.</p></div>
                <button className="icon-button" onClick={() => navigate(returnView)} aria-label="Close"><X size={17} /></button>
            </div>
            <form className="form-grid" onSubmit={addWord}>
                <div className="language-row">
                    <div className="field"><label htmlFor="source-language">Source language</label><select id="source-language" value={form.sourceLanguage} onChange={(event) => { const sourceLanguage = event.target.value; setForm((previous) => ({ ...previous, sourceLanguage })); }}>{languageOptions.map((language) => <option value={language} key={language}>{language}</option>)}</select></div>
                    <div className="field"><label htmlFor="target-language">Target language</label><select id="target-language" value={form.targetLanguage} onChange={(event) => { const targetLanguage = event.target.value; setForm((previous) => ({ ...previous, targetLanguage })); }}>{languageOptions.map((language) => <option value={language} key={language}>{language}</option>)}</select></div>
                </div>
                <div className="field"><label htmlFor="word">Word or phrase</label><div className="input-with-action"><input id="word" required value={form.word} onChange={(event) => { const word = event.target.value; setForm((previous) => ({ ...previous, word })); }} placeholder="e.g. der Kies" /><button type="button" className="input-action" onClick={generateSentence} disabled={generating || !form.word.trim()}><Sparkles size={13} />{generating ? "Generating..." : "Generate"}</button></div></div>
                <div className="field"><label htmlFor="meaning">Meaning in target language</label><textarea id="meaning" value={form.meaning} onChange={(event) => { const meaning = event.target.value; setForm((previous) => ({ ...previous, meaning })); }} placeholder="Generated translation" /></div>
                <div className="field"><label htmlFor="example">Example sentence</label><textarea id="example" value={form.exampleSentence} onChange={(event) => { const exampleSentence = event.target.value; setForm((previous) => ({ ...previous, exampleSentence })); }} placeholder="Generated example sentence" /></div>
                <div className="field"><label htmlFor="cefr-level">Estimated CEFR level</label><select id="cefr-level" value={form.cefrLevel} onChange={(event) => { const cefrLevel = event.target.value as CefrLevel | ""; setForm((previous) => ({ ...previous, cefrLevel })); }}><option value="">Not set</option>{cefrLevels.map((level) => <option value={level} key={level}>{level}</option>)}</select></div>
                {generationStatus && <div className="form-note">{generationStatus}</div>}
                <div className="field"><label htmlFor="folder">Folder</label><select id="folder" value={form.folderId} onChange={(event) => { const folderId = event.target.value; setForm((previous) => ({ ...previous, folderId })); }}>{folders.map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}</select></div>
                <div className="field"><label htmlFor="notes">Notes <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span></label><textarea id="notes" value={form.notes} onChange={(event) => { const notes = event.target.value; setForm((previous) => ({ ...previous, notes })); }} placeholder="A small memory hook..." /></div>
                <div className="modal-footer"><button type="button" className="ghost-button" onClick={() => navigate(returnView)}>Cancel</button><button className="primary-button" type="submit"><Check size={15} /> Save word</button></div>
            </form>
        </div>
    );
}
