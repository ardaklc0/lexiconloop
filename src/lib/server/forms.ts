import type { WordForms } from "@/lib/types";
import { asText as text } from "@/lib/server/gemini";

const partsOfSpeech = ["noun", "verb", "adjective", "other"] as const;

// Gemini sometimes returns "" or "null" for fields that do not apply.
const optional = (value: unknown) => {
    const result = text(value);
    return result && !/^(null|none|n\/a|-)$/i.test(result) ? result : undefined;
};

export function parseForms(raw: Record<string, unknown>): WordForms {
    const partOfSpeech = partsOfSpeech.find((item) => item === raw.partOfSpeech) ?? "other";
    const inflected = Array.isArray(raw.inflected)
        ? Array.from(new Set(raw.inflected.map(text).filter(Boolean))).slice(0, 20)
        : [];
    const forms: WordForms = {
        partOfSpeech,
        article: partOfSpeech === "noun" ? optional(raw.article) : undefined,
        plural: partOfSpeech === "noun" ? optional(raw.plural) : undefined,
        gender: partOfSpeech === "noun" ? optional(raw.gender) : undefined,
        perfect: partOfSpeech === "verb" ? optional(raw.perfect) : undefined,
        pastSimple: partOfSpeech === "verb" ? optional(raw.pastSimple) : undefined,
        separablePrefix: partOfSpeech === "verb" ? optional(raw.separablePrefix) : undefined,
        inflected: inflected.length ? inflected : undefined,
    };
    // Drop undefined keys so the stored JSON stays small.
    return JSON.parse(JSON.stringify(forms)) as WordForms;
}
