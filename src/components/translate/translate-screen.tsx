import { useEffect } from "react";
import { BookOpenCheck, Check, CirclePlus, Languages, Sparkles, Volume2 } from "lucide-react";
import { LearningDetails } from "@/components/translate/learning-details";
import { translationSaveKey, TranslationItems, type Relation, type SaveState } from "@/components/translate/translation-items";
import { useAppData } from "@/context/app-data-context";
import { screenState, setScreenState, useScreenState } from "@/hooks/use-screen-state";
import { requestRelatedWord, requestTranslation, type TranslationItem, type TranslationResult } from "@/lib/api-client";
import { languageOptions } from "@/lib/constants";
import { speakWord } from "@/lib/speech";
import { insertWord } from "@/lib/supabase/data";
import type { CefrLevel } from "@/lib/types";

const sourceLanguageState = screenState("translate.source-language", "German");
const targetLanguageState = screenState("translate.target-language", "English");
const wordState = screenState("translate.word", "");
const resultState = screenState<TranslationResult | null>("translate.result", null);
const loadingState = screenState("translate.loading", false);
const statusState = screenState("translate.status", "");
const saveStateState = screenState<"idle" | SaveState>("translate.save-state", "idle");
const relatedSaveStatesState = screenState<Record<string, SaveState>>("translate.related-save-states", {});

export function TranslateScreen() {
    const { cards, setCards, setSyncStatus, getCloudContext } = useAppData();
    const [translateSourceLanguage, setTranslateSourceLanguage] = useScreenState(sourceLanguageState);
    const [translateTargetLanguage, setTranslateTargetLanguage] = useScreenState(targetLanguageState);
    const [translateWord, setTranslateWord] = useScreenState(wordState);
    const [translationResult, setTranslationResult] = useScreenState(resultState);
    const [translationLoading, setTranslationLoading] = useScreenState(loadingState);
    const [translationStatus, setTranslationStatus] = useScreenState(statusState);
    const [translationSaveState, setTranslationSaveState] = useScreenState(saveStateState);
    const [relatedSaveStates, setRelatedSaveStates] = useScreenState(relatedSaveStatesState);

    // The analysis is cleared when leaving the screen; the typed word and languages are kept.
    useEffect(() => () => {
        setScreenState(resultState, null);
        setScreenState(statusState, "");
    }, []);

    async function generateTranslation(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const word = translateWord.trim();
        if (!word) return;
        setTranslationLoading(true);
        setTranslationResult(null);
        setTranslationStatus("");
        setTranslationSaveState("idle");
        setRelatedSaveStates({});
        try {
            setTranslationResult(await requestTranslation({ sourceLanguage: translateSourceLanguage, targetLanguage: translateTargetLanguage, word }));
        } catch (error) {
            setTranslationStatus(error instanceof Error ? error.message : "Could not analyze this word.");
        } finally {
            setTranslationLoading(false);
        }
    }

    async function saveTranslationCard(input: {
        word: string;
        meaning: string;
        sourceExample: string;
        cefrLevel: CefrLevel;
        sourceLanguage: string;
        targetLanguage: string;
        notes?: string;
        saveKey: "main" | string;
    }) {
        const cloud = getCloudContext();
        if (!cloud) {
            setTranslationStatus("Supabase is required to save a translated word.");
            if (input.saveKey === "main") setTranslationSaveState("idle");
            else setRelatedSaveStates((previous) => ({ ...previous, [input.saveKey]: "saved" }));
            return;
        }

        const duplicate = cards.find((card) => card.word.trim().toLocaleLowerCase() === input.word.trim().toLocaleLowerCase() && card.sourceLanguage === input.sourceLanguage && card.targetLanguage === input.targetLanguage);
        if (duplicate) {
            setTranslationStatus(`"${input.word}" is already in your vocabulary.`);
            if (input.saveKey === "main") setTranslationSaveState("saved");
            else setRelatedSaveStates((previous) => ({ ...previous, [input.saveKey]: "saved" }));
            return;
        }

        if (input.saveKey === "main") setTranslationSaveState("saving");
        else setRelatedSaveStates((previous) => ({ ...previous, [input.saveKey]: "saving" }));

        try {
            setSyncStatus("Saving translated word...");
            const created = await insertWord(cloud.client, cloud.userId, cloud.workspaceId, {
                word: input.word.trim(),
                meaning: input.meaning.trim(),
                exampleSentence: input.sourceExample.trim(),
                folderId: "",
                sourceLanguage: input.sourceLanguage,
                targetLanguage: input.targetLanguage,
                cefrLevel: input.cefrLevel,
                notes: input.notes,
            });
            const createdAt = created.createdAt;
            setCards((previous) => [{
                id: created.id,
                word: input.word.trim(),
                meaning: input.meaning.trim(),
                exampleSentence: input.sourceExample.trim(),
                folderId: "",
                sourceLanguage: input.sourceLanguage,
                targetLanguage: input.targetLanguage,
                cefrLevel: input.cefrLevel,
                notes: input.notes,
                createdAt,
                state: "new",
                stability: 0.25,
                difficulty: 5,
                dueAt: createdAt,
                reps: 0,
                lapses: 0,
            }, ...previous]);
            setSyncStatus("Synced");
            setTranslationStatus(`"${input.word}" was added to your vocabulary.`);
            if (input.saveKey === "main") setTranslationSaveState("saved");
            else setRelatedSaveStates((previous) => ({ ...previous, [input.saveKey]: "saved" }));
        } catch (error) {
            setSyncStatus(error instanceof Error ? error.message : "Translated word could not be saved.");
            setTranslationStatus(error instanceof Error ? error.message : "Translated word could not be saved.");
            if (input.saveKey === "main") setTranslationSaveState("idle");
            else setRelatedSaveStates((previous) => {
                const next = { ...previous };
                delete next[input.saveKey];
                return next;
            });
        }
    }

    async function saveMainTranslation() {
        if (!translationResult || translationSaveState !== "idle") return;
        await saveTranslationCard({
            word: translationResult.word,
            meaning: translationResult.meaning,
            sourceExample: translationResult.sourceExample,
            cefrLevel: translationResult.cefrLevel,
            sourceLanguage: translationResult.sourceLanguage,
            targetLanguage: translationResult.targetLanguage,
            saveKey: "main",
        });
    }

    async function saveRelatedTranslation(item: TranslationItem, relation: Relation) {
        if (!translationResult) return;
        const saveKey = translationSaveKey(item.word, relation);
        if (relatedSaveStates[saveKey]) return;
        const duplicate = cards.some((card) => card.word.trim().toLocaleLowerCase() === item.word.trim().toLocaleLowerCase() && card.sourceLanguage === translationResult.sourceLanguage && card.targetLanguage === translationResult.targetLanguage);
        if (duplicate) {
            setRelatedSaveStates((previous) => ({ ...previous, [saveKey]: "saved" }));
            setTranslationStatus(`"${item.word}" is already in your vocabulary.`);
            return;
        }
        setRelatedSaveStates((previous) => ({ ...previous, [saveKey]: "saving" }));
        try {
            const data = await requestRelatedWord({ sourceLanguage: translationResult.sourceLanguage, targetLanguage: translationResult.targetLanguage, word: item.word, meaning: item.translation, relation });
            await saveTranslationCard({
                word: item.word,
                meaning: data.meaning?.trim() || item.translation,
                sourceExample: data.sourceExample,
                cefrLevel: data.cefrLevel,
                sourceLanguage: translationResult.sourceLanguage,
                targetLanguage: translationResult.targetLanguage,
                notes: `${relation === "synonym" ? "Synonym" : "Antonym"} of ${translationResult.word}`,
                saveKey,
            });
        } catch (error) {
            setTranslationStatus(error instanceof Error ? error.message : "Related word could not be saved.");
            setRelatedSaveStates((previous) => {
                const next = { ...previous };
                delete next[saveKey];
                return next;
            });
        }
    }

    const relatedSaving = (relation: Relation) => ({ relation, saveStates: relatedSaveStates, onSave: (item: TranslationItem, itemRelation: Relation) => void saveRelatedTranslation(item, itemRelation) });
    const result = translationResult;
    return <div className="translate-page">
        <section className="translate-search surface-panel">
            <div className="translate-search-copy"><div className="eyebrow">AI word studio</div><h2>Unpack one word at a time.</h2><p>See meaning, related forms, examples, and etymology in your target language.</p></div>
            <form className="form-grid" onSubmit={generateTranslation}>
                <div className="language-row"><div className="field"><label htmlFor="translate-source-language">Source language</label><select id="translate-source-language" value={translateSourceLanguage} onChange={(event) => setTranslateSourceLanguage(event.target.value)}>{languageOptions.map((language) => <option value={language} key={language}>{language}</option>)}</select></div><div className="field"><label htmlFor="translate-target-language">Target language</label><select id="translate-target-language" value={translateTargetLanguage} onChange={(event) => setTranslateTargetLanguage(event.target.value)}>{languageOptions.map((language) => <option value={language} key={language}>{language}</option>)}</select></div></div>
                <div className="field"><label htmlFor="translate-word">Word or phrase</label><div className="input-with-action"><input id="translate-word" value={translateWord} onChange={(event) => setTranslateWord(event.target.value)} placeholder="e.g. bevorzugen" /><button type="submit" className="input-action" disabled={translationLoading || !translateWord.trim()}><Sparkles size={13} />{translationLoading ? "Analyzing..." : "Analyze"}</button></div></div>
                {translationStatus && <div className="form-note">{translationStatus}</div>}
            </form>
        </section>
        {!result && !translationLoading && !translationStatus && <section className="translate-empty surface-panel"><Sparkles size={28} /><h2>Start with a word.</h2><p>The result stays on this screen and is never saved to your vocabulary.</p></section>}
        {translationLoading && <section className="translate-empty surface-panel"><Sparkles size={28} /><h2>Reading the word...</h2><p>Gemini 2.5 Flash is preparing a focused language breakdown.</p></section>}
        {result && <div className="translation-results"><section className="translation-hero surface-panel"><div><div className="eyebrow">{result.sourceLanguage} → {result.targetLanguage}</div><h2>{result.word}</h2><p className="translation-meaning">{result.meaning}</p><p>{result.definition}</p></div><div className="translation-meta"><span>{result.partOfSpeech || "Word"}</span><button type="button" className="speaker-button" onClick={() => speakWord(result.word, result.sourceLanguage)} aria-label={`Pronounce ${result.word}`}><Volume2 size={17} /></button><button type="button" className="icon-button translation-save-button" onClick={() => void saveMainTranslation()} disabled={translationSaveState !== "idle"} aria-label={`${translationSaveState === "saved" ? "Saved" : "Add"} ${result.word}`}>{translationSaveState === "saved" ? <Check size={15} /> : <CirclePlus size={15} />}</button></div></section><div className="translation-grid"><section className="surface-panel translation-section translation-primary-section"><div className="panel-heading"><div><h2>Examples</h2><p className="panel-subtitle">Same idea in both languages · {result.cefrLevel}</p></div><Languages size={17} color="var(--sage)" /></div><div className="translation-example"><span>{result.sourceLanguage}</span><p>{result.sourceExample}</p></div><div className="translation-example"><span>{result.targetLanguage}</span><p>{result.targetExample}</p></div></section><section className="surface-panel translation-section translation-primary-section"><div className="panel-heading"><div><h2>Word family</h2><p className="panel-subtitle">Related forms in the source language</p></div><BookOpenCheck size={17} color="var(--sage)" /></div><div className="translation-family-list"><TranslationItems items={result.wordFamily} emptyLabel="No related forms were returned." /></div></section><section className="surface-panel translation-section"><div className="panel-heading"><div><h2>Synonyms</h2><p className="panel-subtitle">Close alternatives · add as cards</p></div></div><TranslationItems items={result.synonyms} emptyLabel="No synonyms were returned." related={relatedSaving("synonym")} /></section><section className="surface-panel translation-section"><div className="panel-heading"><div><h2>Antonyms</h2><p className="panel-subtitle">Contrasting meanings · add as cards</p></div></div><TranslationItems items={result.antonyms} emptyLabel="No antonyms were returned." related={relatedSaving("antonym")} /></section></div><LearningDetails result={result} /><section className="surface-panel etymology-section"><div className="panel-heading"><div><h2>Etymology</h2><p className="panel-subtitle">AI-generated root information</p></div><span className="state-tag state-review">{result.etymology.confidence || "unknown"}</span></div>{result.etymology.explanation ? <div className="etymology-copy"><div className="etymology-root"><span>Root</span><strong>{result.etymology.root || "Not available"}</strong><small>{result.etymology.rootLanguage || "Unknown language"}{result.etymology.rootMeaning ? ` · ${result.etymology.rootMeaning}` : ""}</small></div><p>{result.etymology.explanation}</p></div> : <p className="translation-empty-inline">No reliable etymological information was returned for this word.</p>}</section></div>}
    </div>;
}
