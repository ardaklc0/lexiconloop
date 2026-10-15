import { reviewDays } from "@/lib/kobo/days";
import { html, koboPage, notice } from "@/lib/kobo/html";
import { errorMessage, loadPreferences, redirectTo, withKoboSession, withMessage } from "@/lib/kobo/session";
import { calculateNextReview, formatDueIn } from "@/lib/spaced-repetition";
import { loadUserData, saveReview } from "@/lib/supabase/data";
import type { ReviewRating, WordRecord } from "@/lib/types";
import { buildReviewQueue } from "@/lib/word-filters";

const ratings: Array<[ReviewRating, string]> = [["forgot", "Forgot"], ["hard", "Hard"], ["good", "Good"], ["easy", "Easy"]];

function cardFront(card: WordRecord) {
    return html`<div class="card"><div class="language">${card.sourceLanguage}</div><div class="word">${card.word}</div>${card.exampleSentence ? html`<div class="example">${card.exampleSentence}</div>` : null}</div>
        <a class="button primary" href="/kobo?reveal=${encodeURIComponent(card.id)}">Show answer</a>`;
}

function cardBack(card: WordRecord, now: Date) {
    return html`<div class="card"><div class="language">${card.sourceLanguage} → ${card.targetLanguage}</div><div class="word">${card.word}</div><div class="meaning">${card.meaning || "Add a meaning after this review."}</div>${card.exampleSentence ? html`<div class="example">${card.exampleSentence}</div>` : null}</div>
        <form method="post" action="/kobo">
            <input type="hidden" name="cardId" value="${card.id}">
            <input type="hidden" name="reps" value="${card.reps}">
            <table class="ratings"><tr>${ratings.map(([rating, label]) => html`<td><button type="submit" name="rating" value="${rating}" class="${rating === "good" ? "primary" : ""}">${label}<small>${formatDueIn(calculateNextReview(card, rating, now).dueAt, now)}</small></button></td>`)}</tr></table>
        </form>`;
}

export async function GET(request: Request) {
    return withKoboSession(request, async (session) => {
        const params = new URL(request.url).searchParams;
        const [{ cards, logs }, { dailyGoal, timeZone }] = await Promise.all([loadUserData(session.supabase, session.userId, session.workspace.id), loadPreferences(session)]);
        const now = new Date();
        const queue = buildReviewQueue(cards, "due", "oldest-due", now);
        const card = queue[0];
        const { todayCount, streak } = reviewDays(logs, timeZone, now);
        const progress = html`<p><strong>${queue.length} due</strong> · Today ${todayCount}/${dailyGoal}${todayCount >= dailyGoal ? " · Goal complete" : ""} · ${streak}-day streak</p>`;

        let content;
        if (!cards.length) {
            content = html`<div class="card"><div class="word">Your vocabulary starts here.</div><p>Add your first word to start a review queue.</p></div><a class="button primary" href="/kobo/add">Add your first word</a>`;
        } else if (!card) {
            const nextDue = Math.min(...cards.map((item) => new Date(item.dueAt).getTime()));
            content = html`<div class="card"><div class="word">All clear for now.</div><p>Your next cards will appear here when they are due. Next card: ${formatDueIn(new Date(nextDue).toISOString(), now).toLowerCase()}.</p></div><a class="button" href="/kobo">Check again</a>`;
        } else {
            content = params.get("reveal") === card.id ? cardBack(card, now) : cardFront(card);
        }

        return koboPage({ title: "Review", section: "review", body: html`${notice(params.get("error"), "error")}${progress}${content}` });
    });
}

export async function POST(request: Request) {
    return withKoboSession(request, async (session) => {
        try {
            const form = await request.formData();
            const cardId = String(form.get("cardId") ?? "");
            const reps = String(form.get("reps") ?? "");
            const rating = ratings.find(([value]) => value === form.get("rating"))?.[0];
            if (!rating) return redirectTo(request, "/kobo");
            const { cards } = await loadUserData(session.supabase, session.userId, session.workspace.id);
            const card = cards.find((item) => item.id === cardId);
            // A changed rep count means this card was already rated (e.g. a double tap on a slow screen).
            if (!card || String(card.reps) !== reps) return redirectTo(request, "/kobo");
            const next = calculateNextReview(card, rating, new Date());
            await saveReview(session.supabase, session.workspace.id, card, rating, next);
            return redirectTo(request, "/kobo");
        } catch (error) {
            return redirectTo(request, withMessage("/kobo", "error", errorMessage(error, "Review could not be saved.")));
        }
    });
}
