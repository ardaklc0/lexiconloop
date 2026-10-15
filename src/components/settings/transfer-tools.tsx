import { useRef } from "react";
import { Download, Upload } from "lucide-react";
import { useAppData } from "@/context/app-data-context";
import { screenState, useScreenState } from "@/hooks/use-screen-state";
import { cefrLevels } from "@/lib/constants";
import { sameId } from "@/lib/ids";
import { insertWord } from "@/lib/supabase/data";
import type { CefrLevel, WordRecord } from "@/lib/types";
import { parseVocabularyFile, serializeVocabulary, type VocabularyEntry } from "@/lib/vocabulary-transfer";

const busyState = screenState("settings.transfer-busy", false);
const statusState = screenState("settings.transfer-status", "");

export function TransferTools() {
    const { cards, setCards, folders, getCloudContext } = useAppData();
    const [transferBusy, setTransferBusy] = useScreenState(busyState);
    const [transferStatus, setTransferStatus] = useScreenState(statusState);
    const importFileRef = useRef<HTMLInputElement>(null);

    function exportVocabulary(format: "csv" | "json" | "anki") {
        const entries: VocabularyEntry[] = cards.map((card) => ({
            word: card.word,
            meaning: card.meaning,
            exampleSentence: card.exampleSentence,
            sourceLanguage: card.sourceLanguage,
            targetLanguage: card.targetLanguage,
            folderName: folders.find((folder) => sameId(folder.id, card.folderId))?.name,
            cefrLevel: card.cefrLevel,
            notes: card.notes,
        }));
        const extension = format === "anki" ? "txt" : format;
        const mimeType = format === "json" ? "application/json" : "text/plain;charset=utf-8";
        const file = new Blob([serializeVocabulary(entries, format)], { type: mimeType });
        const url = URL.createObjectURL(file);
        const link = document.createElement("a");
        link.href = url;
        link.download = `lexicon-loop-vocabulary.${extension}`;
        link.click();
        URL.revokeObjectURL(url);
    }

    async function importVocabulary(event: React.ChangeEvent<HTMLInputElement>) {
        const input = event.currentTarget;
        const file = input.files?.[0];
        if (!file) return;
        setTransferBusy(true);
        setTransferStatus("");
        try {
            const entries = parseVocabularyFile(file.name, await file.text());
            const cloud = getCloudContext();
            if (!cloud) throw new Error("Connect to your workspace before importing words.");

            const knownWords = new Set(cards.map((card) => `${card.word.trim().toLocaleLowerCase()}|${card.sourceLanguage.toLocaleLowerCase()}|${card.targetLanguage.toLocaleLowerCase()}`));
            const added: WordRecord[] = [];
            let skipped = 0;
            let failure = "";

            for (const entry of entries) {
                const word = entry.word.trim();
                const meaning = entry.meaning.trim();
                if (!word || !meaning) {
                    skipped += 1;
                    continue;
                }
                const sourceLanguage = entry.sourceLanguage.trim() || "German";
                const targetLanguage = entry.targetLanguage.trim() || "Turkish";
                const key = `${word.toLocaleLowerCase()}|${sourceLanguage.toLocaleLowerCase()}|${targetLanguage.toLocaleLowerCase()}`;
                if (knownWords.has(key)) {
                    skipped += 1;
                    continue;
                }
                knownWords.add(key);

                const folder = entry.folderName?.trim();
                const folderId = folders.find((item) => item.name.trim().toLocaleLowerCase() === folder?.toLocaleLowerCase())?.id ?? "";
                const cefrLevel = cefrLevels.includes(entry.cefrLevel as CefrLevel) ? entry.cefrLevel as CefrLevel : undefined;
                try {
                    const created = await insertWord(cloud.client, cloud.userId, cloud.workspaceId, {
                        word,
                        meaning,
                        exampleSentence: entry.exampleSentence?.trim() || undefined,
                        folderId,
                        sourceLanguage,
                        targetLanguage,
                        cefrLevel,
                        notes: entry.notes?.trim() || undefined,
                    });
                    const createdAt = created.createdAt;
                    added.push({
                        id: created.id,
                        word,
                        meaning,
                        exampleSentence: entry.exampleSentence?.trim() || undefined,
                        folderId,
                        sourceLanguage,
                        targetLanguage,
                        cefrLevel,
                        notes: entry.notes?.trim() || undefined,
                        createdAt,
                        state: "new",
                        stability: 0.25,
                        difficulty: 5,
                        dueAt: createdAt,
                        reps: 0,
                        lapses: 0,
                    });
                } catch (error) {
                    failure = error instanceof Error ? error.message : "A word could not be imported.";
                    break;
                }
            }

            if (added.length) setCards((previous) => [...added, ...previous]);
            setTransferStatus(`Imported ${added.length}; skipped ${skipped}.${failure ? ` Stopped: ${failure}` : ""}`);
        } catch (error) {
            setTransferStatus(error instanceof Error ? error.message : "Could not read this file.");
        } finally {
            input.value = "";
            setTransferBusy(false);
        }
    }

    return <section className="surface-panel"><div className="panel-heading"><div><h2>Vocabulary backup</h2><p className="panel-subtitle">Move your words between Lexicon Loop and other study tools.</p></div><Download size={17} color="var(--sage)" /></div><div className="settings-list"><div className="setting-row"><div className="setting-copy"><strong>Import vocabulary</strong><span>CSV, JSON, or Anki tab-separated text.</span></div><div className="setting-control"><input ref={importFileRef} type="file" accept=".csv,.json,.txt,.tsv,text/csv,application/json,text/plain" hidden onChange={(event) => void importVocabulary(event)} /><button className="ghost-button" disabled={transferBusy} onClick={() => importFileRef.current?.click()}><Upload size={14} />{transferBusy ? "Importing..." : "Choose file"}</button></div></div><div className="setting-row"><div className="setting-copy"><strong>Export CSV</strong><span>Spreadsheet-friendly, with folder and language details.</span></div><button className="ghost-button" onClick={() => exportVocabulary("csv")}><Download size={14} /> CSV</button></div><div className="setting-row"><div className="setting-copy"><strong>Export JSON</strong><span>Keep a structured backup of your vocabulary.</span></div><button className="ghost-button" onClick={() => exportVocabulary("json")}><Download size={14} /> JSON</button></div><div className="setting-row"><div className="setting-copy"><strong>Export Anki</strong><span>Tab-separated front, back, and example fields.</span></div><button className="ghost-button" onClick={() => exportVocabulary("anki")}><Download size={14} /> TXT</button></div></div>{transferStatus && <div className="form-note" role="status" aria-live="polite">{transferStatus}</div>}</section>;
}
