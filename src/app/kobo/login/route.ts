import { html, koboBarePage, notice } from "@/lib/kobo/html";
import { errorMessage, redirectTo, withMessage } from "@/lib/kobo/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
    const supabase = await createSupabaseServerClient();
    if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) return redirectTo(request, "/kobo");
    }
    const error = new URL(request.url).searchParams.get("error");
    return koboBarePage({
        title: "Sign in",
        body: html`<h1>Sign in</h1>
            ${notice(supabase ? error : "Supabase is not configured on this server.", "error")}
            <form method="post" action="/kobo/login">
                <label for="email">Email address</label>
                <input id="email" name="email" type="email" required autocomplete="email" autocapitalize="off" autocorrect="off">
                <label for="password">Password</label>
                <input id="password" name="password" type="password" required autocomplete="current-password">
                <button class="primary" type="submit">Sign in</button>
            </form>
            <p class="muted">Use the same account as the Lexicon Loop website.</p>`,
    });
}

export async function POST(request: Request) {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return redirectTo(request, "/kobo/login");
    try {
        const form = await request.formData();
        const email = String(form.get("email") ?? "").trim();
        const password = String(form.get("password") ?? "");
        if (!email || !password) return redirectTo(request, withMessage("/kobo/login", "error", "Enter your email and password."));
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return redirectTo(request, withMessage("/kobo/login", "error", error.message));
        return redirectTo(request, "/kobo");
    } catch (error) {
        return redirectTo(request, withMessage("/kobo/login", "error", errorMessage(error, "Could not sign in.")));
    }
}
