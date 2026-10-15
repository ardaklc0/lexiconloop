import { formatDay } from "@/lib/kobo/days";
import { html, koboPage } from "@/lib/kobo/html";
import { loadPreferences, withKoboSession } from "@/lib/kobo/session";
import { sameId } from "@/lib/ids";
import { formatDueIn } from "@/lib/spaced-repetition";
import { loadUserData } from "@/lib/supabase/data";
import type { ReviewRating } from "@/lib/types";

const ratingLabels: Record<ReviewRating, string> = { forgot: "Forgot", hard: "Hard", good: "Good", easy: "Easy" };

export async function GET(request: Request, { params }: { params: { id: string } }) {
    return withKoboSession(request, async (session) => {
        const [{ cards, folders, logs }, { timeZone }] = await Promise.all([loadUserData(session.supabase, session.userId, session.workspace.id), loadPreferences(session)]);
        const card = cards.find((item) => item.id === params.id);
        if (!card) {
            return koboPage({ title: "Word", section: "words", status: 404, body: html`<h1>Word not found</h1><p>This word is no longer available.</p><a class="button" href="/kobo/words">Back to words</a>` });
        }
        const wordLogs = logs.filter((log) => log.wordId === card.id).sort((first, second) => new Date(second.reviewedAt).getTime() - new Date(first.reviewedAt).getTime());
        const successfulReviews = wordLogs.filter((log) => log.rating !== "forgot").length;
        const folderName = folders.find((folder) => sameId(folder.id, card.folderId))?.name ?? "Unsorted";

        return koboPage({
            title: card.word,
            section: "words",
            body: html`<a class="button" href="/kobo/words">Back to words</a>
                <div class="card"><div class="language">${card.sourceLanguage} → ${card.targetLanguage} · ${folderName}</div><div class="word">${card.word}</div><div class="meaning">${card.meaning || "Meaning to be added"}</div>${card.exampleSentence ? html`<div class="example">${card.exampleSentence}</div>` : null}</div>
                <table class="stats">
                    <tr><td>Next review</td><td class="value">${formatDueIn(card.dueAt)}</td></tr>
                    <tr><td>Current state</td><td class="value">${card.state}</td></tr>
                    <tr><td>Reviews</td><td class="value">${wordLogs.length}</td></tr>
                    <tr><td>Success rate</td><td class="value">${wordLogs.length ? `${Math.round((successfulReviews / wordLogs.length) * 100)}%` : "No reviews yet"}</td></tr>
                    ${card.cefrLevel ? html`<tr><td>CEFR level</td><td class="value">${card.cefrLevel}</td></tr>` : null}
                </table>
                ${card.notes ? html`<h2>Notes</h2><p>${card.notes}</p>` : null}
                <h2>Review history</h2>
                ${wordLogs.length ? html`<table class="list">${wordLogs.slice(0, 15).map((log) => html`<tr><td>${formatDay(log.reviewedAt, timeZone)}</td><td class="right"><strong>${ratingLabels[log.rating]}</strong></td></tr>`)}</table>` : html`<p>Review this word to start building its history.</p>`}`,
        });
    });
}
