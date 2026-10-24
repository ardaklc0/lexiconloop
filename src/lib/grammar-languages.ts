// Languages whose words get article / plural / tense data, with the grammar terms the prompts and UI use.
export type GrammarLanguage = {
    articles: string;
    perfect: string;
    pastSimple: string;
    separablePrefix: boolean;
    /** Languages without a plural-by-article rule still get plural, so only noun gender names differ. */
    genderNote: string;
};

export const grammarLanguages: Record<string, GrammarLanguage> = {
    German: { articles: "der, die, das", perfect: "Perfekt", pastSimple: "Präteritum", separablePrefix: true, genderNote: "masculine, feminine or neuter" },
    French: { articles: "le, la, l'", perfect: "Passé composé", pastSimple: "Imparfait", separablePrefix: false, genderNote: "masculine or feminine" },
    Spanish: { articles: "el, la", perfect: "Pretérito perfecto", pastSimple: "Pretérito indefinido", separablePrefix: false, genderNote: "masculine or feminine" },
    Italian: { articles: "il, lo, la, l'", perfect: "Passato prossimo", pastSimple: "Imperfetto", separablePrefix: false, genderNote: "masculine or feminine" },
};

export const hasGrammarForms = (language: string) => language in grammarLanguages;
