import { grammarLanguages } from "@/lib/grammar-languages";
import type { ReviewRating, WordRecord } from "@/lib/types";

export type ActiveRecallMode = "reverse" | "cloze" | "form";
export type AnswerGrade = "exact" | "accent" | "close" | "wrong";
export type FormKind = "article" | "plural" | "perfect" | "pastSimple" | "prefix";
export type TypedAttempt = { answer: string; grade: AnswerGrade; suggested: ReviewRating; skipped: boolean; mode?: ActiveRecallMode; formKind?: FormKind };
export type RecallPrompt =
    | { mode: "reverse" }
    | { mode: "cloze"; before: string; after: string; surface: string; isInflected: boolean }
    | { mode: "form"; kind: FormKind; question: string; answer: string; expected: string[] };

const articles = new Set(["der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "einem", "einer", "the", "a", "an", "le", "la", "les", "l", "un", "une", "el", "los", "las", "il", "lo", "gli", "bir", "to"]);

const stripAccents = (value: string) => value
    .replace(/ß/g, "ss")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

// Lowercase + collapse whitespace/punctuation, keeping accents.
const tidy = (value: string) => value
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const dropArticle = (value: string) => {
    const [first, ...rest] = value.split(" ");
    return rest.length && articles.has(first) ? rest.join(" ") : value;
};

// "ae/oe/ue" and "a/o/u" spellings of the umlauts compare equal once both sides are folded.
const fold = (value: string) => stripAccents(value).replace(/([aou])e/g, "$1");

// "der Tisch / Tische", "to run (fast)" -> separate acceptable answers.
export const answerVariants = (word: string) => {
    const variants = word
        .split(/[/;|]/)
        .map((part) => part.replace(/\([^)]*\)/g, " "))
        .map((part) => dropArticle(tidy(part)))
        .filter(Boolean);
    return variants.length ? variants : [dropArticle(tidy(word))].filter(Boolean);
};

const editDistance = (a: string, b: string) => {
    if (a === b) return 0;
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
        const current = [i];
        for (let j = 1; j <= b.length; j += 1) {
            current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        previous = current;
    }
    return previous[b.length];
};

const gradeToRating: Record<AnswerGrade, ReviewRating> = { exact: "good", accent: "good", close: "hard", wrong: "forgot" };

export function gradeAnswer(typed: string, expected: string[]): AnswerGrade {
    const answer = dropArticle(tidy(typed));
    if (!answer) return "wrong";
    let best: AnswerGrade = "wrong";
    for (const target of expected) {
        if (answer === target) return "exact";
        const foldedAnswer = fold(answer);
        const foldedTarget = fold(target);
        if (foldedAnswer === foldedTarget) best = "accent";
        else if (best === "wrong") {
            const allowed = foldedTarget.length >= 9 ? 2 : foldedTarget.length >= 5 ? 1 : 0;
            if (allowed && editDistance(foldedAnswer, foldedTarget) <= allowed) best = "close";
        }
    }
    return best;
}

export const buildAttempt = (typed: string, expected: string[], extraAccepted: string[] = []): TypedAttempt => {
    const grade = gradeAnswer(typed, [...expected, ...extraAccepted.map((item) => dropArticle(tidy(item)))]);
    return { answer: typed.trim(), grade, suggested: gradeToRating[grade], skipped: false };
};

export const skippedAttempt = (): TypedAttempt => ({ answer: "", grade: "wrong", suggested: "forgot", skipped: true });

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Finds the word (or one of its inflected forms) inside a sentence as a whole word, case-insensitively.
export function findWordInText(text: string, word: string, inflected: string[] = []) {
    const variants = answerVariants(word);
    const candidates = Array.from(new Set([...variants, tidy(word), ...inflected.map(tidy)])).filter(Boolean).sort((a, b) => b.length - a.length);
    for (const candidate of candidates) {
        const pattern = candidate.split(" ").map(escapeRegExp).join("\\s+");
        const match = new RegExp(`(^|[^\\p{L}\\p{N}])(${pattern})(?![\\p{L}\\p{N}])`, "iu").exec(text);
        if (!match) continue;
        const start = match.index + match[1].length;
        return { start, end: start + match[2].length, surface: match[2], isInflected: !variants.includes(dropArticle(tidy(match[2]))) };
    }
    return null;
}

// The example sentence plus the AI-written practice sentences, whichever contain the word (or a known form of it).
// Several matches take turns between reviews. Returns null when none does, so the caller falls back to reverse mode.
export function buildCloze(card: WordRecord): Extract<RecallPrompt, { mode: "cloze" }> | null {
    const sentences = [card.exampleSentence, ...(card.clozeSentences ?? [])].map((sentence) => sentence?.trim()).filter((sentence): sentence is string => Boolean(sentence));
    const matches = sentences.flatMap((sentence) => {
        const found = findWordInText(sentence, card.word, card.forms?.inflected);
        return found ? [{ sentence, found }] : [];
    });
    if (!matches.length) return null;
    const { sentence, found } = matches[Math.floor(card.reps / 2) % matches.length];
    return { mode: "cloze", before: sentence.slice(0, found.start), after: sentence.slice(found.end), surface: found.surface, isInflected: found.isInflected };
}

type FormPrompt = Extract<RecallPrompt, { mode: "form" }>;

// Questions about the grammar data the AI stored for the word (article, plural, tenses).
export function buildFormQuestions(card: WordRecord): FormPrompt[] {
    const forms = card.forms;
    const grammar = grammarLanguages[card.sourceLanguage];
    if (!forms || !grammar) return [];
    const questions: FormPrompt[] = [];
    const add = (kind: FormKind, question: string, answer: string | undefined, accepted: string[] = []) => {
        if (!answer) return;
        const expected = Array.from(new Set([...answerVariants(answer), ...accepted.flatMap(answerVariants)]));
        if (expected.length) questions.push({ mode: "form", kind, question, answer, expected });
    };
    if (forms.partOfSpeech === "noun") {
        add("article", "Article?", forms.article);
        add("plural", "Plural?", forms.plural);
    }
    if (forms.partOfSpeech === "verb") {
        // The participle alone ("gelaufen") is accepted as well as "ist gelaufen".
        add("perfect", `${grammar.perfect}? (3rd person singular)`, forms.perfect, [forms.perfect?.split(/\s+/).pop() ?? ""]);
        add("pastSimple", `${grammar.pastSimple}? (3rd person singular)`, forms.pastSimple);
        add("prefix", "Separable prefix?", forms.separablePrefix);
    }
    return questions;
}

// Typing needs something already seen, and a meaning to prompt with.
// Cloze and reverse alternate so consecutive reviews of a word feel different.
export function pickRecallPrompt(card: WordRecord): RecallPrompt | null {
    if (card.reps === 0 || card.state === "new" || !card.meaning.trim()) return null;
    // Every third review (when grammar data exists) asks a grammar question instead.
    if (card.reps % 3 === 2) {
        const questions = buildFormQuestions(card);
        if (questions.length) return questions[Math.floor(card.reps / 3) % questions.length];
    }
    if (card.reps % 2 === 0) {
        const cloze = buildCloze(card);
        if (cloze) return cloze;
    }
    return { mode: "reverse" };
}
