import { Pencil, Trash2, Volume2 } from "lucide-react";
import { useAppData } from "@/context/app-data-context";
import { useNavigation } from "@/context/navigation-context";
import { speakWord } from "@/lib/speech";
import { deleteWord } from "@/lib/supabase/data";
import type { WordRecord } from "@/lib/types";

export function useRemoveWord() {
    const { setCards, setSyncStatus, getCloudContext } = useAppData();
    return async (card: WordRecord) => {
        if (!window.confirm(`Delete "${card.word}"?`)) return;
        const cloud = getCloudContext();
        setCards((items) => items.filter((item) => item.id !== card.id));
        if (cloud) {
            try {
                await deleteWord(cloud.client, cloud.userId, cloud.workspaceId, card.id);
                setSyncStatus("Synced");
            } catch (error) {
                setCards((items) => [card, ...items]);
                setSyncStatus(error instanceof Error ? error.message : "Word could not be deleted.");
            }
        }
    };
}

/** Pronounce, edit and delete buttons shown at the end of a word row. */
export function WordRowActions({ card }: { card: WordRecord }) {
    const { openEditWord } = useNavigation();
    const removeWord = useRemoveWord();
    return <div className="row-actions"><button type="button" className="speaker-button word-speaker" onClick={(event) => { event.stopPropagation(); speakWord(card.word, card.sourceLanguage); }} aria-label={`Pronounce ${card.word}`}><Volume2 size={15} /></button><button className="icon-button" onClick={() => openEditWord(card)} aria-label={`Edit ${card.word}`}><Pencil size={14} /></button><button className="icon-button danger-button" onClick={() => void removeWord(card)} aria-label={`Delete ${card.word}`}><Trash2 size={14} /></button></div>;
}
