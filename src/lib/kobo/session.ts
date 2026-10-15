import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { html, koboBarePage } from "@/lib/kobo/html";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaces } from "@/lib/supabase/data";
import type { Folder } from "@/lib/types";

export const workspaceCookie = "kobo_workspace";

type ServerClient = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

export type KoboSession = Awaited<ReturnType<typeof loadSession>>;

async function loadSession(supabase: ServerClient, userId: string, email: string | undefined) {
    const workspaces = await loadWorkspaces(supabase, userId);
    const preferredId = cookies().get(workspaceCookie)?.value;
    const workspace = workspaces.find((item) => item.id === preferredId) ?? workspaces[0];
    if (!workspace) throw new Error("No workspace found for this account.");
    return { supabase, userId, email, workspaces, workspace };
}

/** 303 so a form POST is followed by a plain GET (no resubmission on reload). */
export const redirectTo = (request: Request, path: string) => NextResponse.redirect(new URL(path, request.url), 303);

export const withMessage = (path: string, key: "error" | "saved", message: string) =>
    `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(message)}`;

export const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

/** Runs a handler for a signed-in user, or sends them to the Kobo sign-in page. */
export async function withKoboSession(request: Request, handler: (session: KoboSession) => Promise<Response>) {
    try {
        const supabase = await createSupabaseServerClient();
        if (!supabase) return koboBarePage({ title: "Not configured", status: 503, body: html`<h1>Not configured</h1><p>Supabase is not configured on this server.</p>` });
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return redirectTo(request, "/kobo/login");
        return await handler(await loadSession(supabase, user.id, user.email));
    } catch (error) {
        return koboBarePage({ title: "Something went wrong", status: 500, body: html`<h1>Something went wrong</h1><p>${errorMessage(error, "The page could not be loaded.")}</p><a class="button" href="/kobo">Try again</a>` });
    }
}

/** Daily goal and time zone saved by the website's Settings screen (defaults: 20 reviews, UTC). */
export async function loadPreferences(session: KoboSession) {
    const { data, error } = await session.supabase.from("daily_reminder_settings").select("daily_goal, time_zone").eq("user_id", session.userId).maybeSingle();
    return {
        dailyGoal: !error && data?.daily_goal ? Number(data.daily_goal) : 20,
        timeZone: !error && data?.time_zone ? String(data.time_zone) : "UTC",
    };
}

export async function loadFolders(session: KoboSession) {
    const { data, error } = await session.supabase.from("folders").select("id, name, description, color").eq("user_id", session.userId).eq("workspace_id", session.workspace.id).order("created_at");
    if (error) throw new Error(error.message);
    return (data ?? []) as Folder[];
}
