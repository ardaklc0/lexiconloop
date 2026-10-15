import { html, koboPage } from "@/lib/kobo/html";
import { withKoboSession } from "@/lib/kobo/session";
import { formatDueIn } from "@/lib/spaced-repetition";
import { loadUserData } from "@/lib/supabase/data";
import { defaultWordFilters, filterWords } from "@/lib/word-filters";

const pageSize = 20;

export async function GET(request: Request) {
    return withKoboSession(request, async (session) => {
        const params = new URL(request.url).searchParams;
        const search = params.get("q")?.trim() ?? "";
        const { cards, folders } = await loadUserData(session.supabase, session.userId, session.workspace.id);
        const now = new Date();
        const dayStart = new Date(now);
        dayStart.setHours(0, 0, 0, 0);
        const matches = filterWords(cards, folders, { ...defaultWordFilters, search }, dayStart.getTime());
        const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
        const page = Math.min(pageCount, Math.max(1, Number(params.get("page")) || 1));
        const visible = matches.slice((page - 1) * pageSize, page * pageSize);
        const pageLink = (target: number) => `/kobo/words?${new URLSearchParams({ ...(search ? { q: search } : {}), page: String(target) })}`;

        return koboPage({
            title: "Words",
            section: "words",
            body: html`<h1>Your vocabulary</h1>
                <form method="get" action="/kobo/words"><label for="q">Search</label><table class="pair"><tr><td style="width:70%"><input id="q" name="q" value="${search}" autocapitalize="off" autocorrect="off"></td><td><button type="submit" style="margin:0">Search</button></td></tr></table></form>
                <p class="muted">${search ? html`${matches.length} of ${cards.length} words match “${search}”. <a href="/kobo/words">Clear</a>` : html`${cards.length} words`}${pageCount > 1 ? html` · Page ${page} of ${pageCount}` : null}</p>
                ${visible.length ? html`<table class="list">${visible.map((card) => html`<tr><td><a href="/kobo/words/${encodeURIComponent(card.id)}"><strong>${card.word}</strong></a><br>${card.meaning || "Meaning to be added"}</td><td class="right">${card.state}<br><span class="muted">${formatDueIn(card.dueAt, now)}</span></td></tr>`)}</table>` : html`<p>No words match.</p>`}
                ${pageCount > 1 ? html`<table class="pager"><tr><td>${page > 1 ? html`<a class="button" href="${pageLink(page - 1)}">Previous</a>` : null}</td><td>${page < pageCount ? html`<a class="button" href="${pageLink(page + 1)}">Next</a>` : null}</td></tr></table>` : null}`,
        });
    });
}
