import { Check, CirclePlus } from "lucide-react";
import type { TranslationItem } from "@/lib/api-client";

export type Relation = "synonym" | "antonym" | "family";
export type SaveState = "saving" | "saved";

export const translationSaveKey = (word: string, relation: Relation) => `${relation}:${word.trim().toLocaleLowerCase()}`;

type RelatedSaving = { relation: Relation; saveStates: Record<string, SaveState>; onSave: (item: TranslationItem, relation: Relation) => void };

export function TranslationItems({ items, emptyLabel, related }: { items: TranslationItem[]; emptyLabel: string; related?: RelatedSaving }) {
    if (!items.length) return <p className="translation-empty">{emptyLabel}</p>;
    return <div className="translation-items">{items.map((item) => {
        const saveState = related ? related.saveStates[translationSaveKey(item.word, related.relation)] : undefined;
        return <div className={`translation-item ${related ? "translation-item-action" : ""}`} key={`${item.word}-${item.translation}`}><div><strong>{item.word}</strong>{item.category && <span>{item.category}</span>}</div><span>{item.translation}</span>{related && <button type="button" className="icon-button translation-save-button" onClick={() => related.onSave(item, related.relation)} disabled={saveState === "saving" || saveState === "saved"} aria-label={`${saveState === "saved" ? "Saved" : "Add"} ${item.word}`}>{saveState === "saved" ? <Check size={14} /> : <CirclePlus size={14} />}</button>}</div>;
    })}</div>;
}
