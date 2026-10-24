import type { QuizQuestion } from "@/lib/api-client";
import { answerVariants, gradeAnswer } from "@/lib/typed-answer";

// "almost" is a typed answer with a small spelling slip: shown as a hint, not counted as known.
export type QuizVerdict = "correct" | "almost" | "wrong";

const normalizeQuizAnswer = (value: string) =>
    value.normalize("NFKC").trim().toLocaleLowerCase().replace(/^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu, "").replace(/\s+/g, " ");

export function judgeQuizAnswer(question: QuizQuestion, answer: string): QuizVerdict {
    if (question.type === "typed") {
        const expected = [question.answer, ...(question.accepted ?? [])].flatMap(answerVariants);
        const grade = gradeAnswer(answer, expected);
        return grade === "exact" || grade === "accent" ? "correct" : grade === "close" ? "almost" : "wrong";
    }
    return normalizeQuizAnswer(answer) === normalizeQuizAnswer(question.answer) ? "correct" : "wrong";
}
