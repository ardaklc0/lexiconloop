import { cookies } from "next/headers";
import { html, koboPage, notice } from "@/lib/kobo/html";
import { loadPreferences, redirectTo, withKoboSession, withMessage, workspaceCookie } from "@/lib/kobo/session";

export async function GET(request: Request) {
    return withKoboSession(request, async (session) => {
        const params = new URL(request.url).searchParams;
        const { dailyGoal, timeZone } = await loadPreferences(session);
        return koboPage({
            title: "Settings",
            section: "settings",
            body: html`<h1>Settings</h1>
                ${notice(params.get("saved"))}
                <h2>Workspace</h2>
                ${session.workspaces.length > 1
                    ? html`<form method="post" action="/kobo/settings"><label for="workspace">Learning shelf</label><select id="workspace" name="workspace">${session.workspaces.map((item) => html`<option value="${item.id}"${item.id === session.workspace.id ? html` selected` : null}>${item.name}</option>`)}</select><button type="submit">Switch workspace</button></form>`
                    : html`<p>${session.workspace.name}</p>`}
                <h2>Daily rhythm</h2>
                <p>Daily goal: <strong>${dailyGoal} reviews</strong>. Days are counted in <strong>${timeZone}</strong>.</p>
                <p class="muted">The goal and time zone come from Settings on the Lexicon Loop website. Saving your daily goal or reminder there updates them here.</p>
                <h2>Account</h2>
                <p>${session.email ?? "Signed in"}</p>
                <form method="post" action="/kobo/logout"><button type="submit">Sign out</button></form>`,
        });
    });
}

export async function POST(request: Request) {
    return withKoboSession(request, async (session) => {
        const form = await request.formData();
        const workspace = session.workspaces.find((item) => item.id === form.get("workspace"));
        if (!workspace) return redirectTo(request, "/kobo/settings");
        cookies().set(workspaceCookie, workspace.id, { path: "/kobo", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: new URL(request.url).protocol === "https:" });
        return redirectTo(request, withMessage("/kobo/settings", "saved", `Switched to “${workspace.name}”.`));
    });
}
