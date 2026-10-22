import type { ReviewRating, WordRecord } from "@/lib/types";

export type ActiveRecallMode = "reverse" | "cloze";
export type AnswerGrade = "exact" | "accent" | "close" | "wrong";
export type TypedAttempt = { answer: string; grade: AnswerGrade; suggested: ReviewRating; skipped: boolean };
export type RecallPrompt =
    | { mode: "reverse" }
    | { mode: "cloze"; before: string; after: string; surface: string };

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

// Finds the word inside the example sentence (whole word, case-insensitive).
// Returns null when it only appears inflected or not at all, so the caller falls back to reverse mode.
export function buildCloze(card: WordRecord): Extract<RecallPrompt, { mode: "cloze" }> | null {
    const sentence = card.exampleSentence?.trim();
    if (!sentence) return null;
    const candidates = [...answerVariants(card.word), tidy(card.word)].filter(Boolean).sort((a, b) => b.length - a.length);
    for (const candidate of candidates) {
        const pattern = candidate.split(" ").map(escapeRegExp).join("\\s+");
        const match = new RegExp(`(^|[^\\p{L}\\p{N}])(${pattern})(?![\\p{L}\\p{N}])`, "iu").exec(sentence);
        if (!match) continue;
        const start = match.index + match[1].length;
        return { mode: "cloze", before: sentence.slice(0, start), after: sentence.slice(start + match[2].length), surface: match[2] };
    }
    return null;
}

// Typing needs something already seen, and a meaning to prompt with.
// Cloze and reverse alternate so consecutive reviews of a word feel different.
export function pickRecallPrompt(card: WordRecord): RecallPrompt | null {
    if (card.reps === 0 || card.state === "new" || !card.meaning.trim()) return null;
    if (card.reps % 2 === 0) {
        const cloze = buildCloze(card);
        if (cloze) return cloze;
    }
    return { mode: "reverse" };
}
