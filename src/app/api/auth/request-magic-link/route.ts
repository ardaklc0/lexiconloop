import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAllowedEmail } from "@/lib/auth-allowlist";

export async function POST(request: Request) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !anonKey) {
        return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
    }

    try {
        const body = await request.json() as { email?: string };
        const email = body.email?.trim().toLowerCase();
        if (!email || !email.includes("@")) {
            return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
        }
        if (!isAllowedEmail(email)) {
            return NextResponse.json({ error: "This account is not allowed to sign in." }, { status: 403 });
        }

        const supabase = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: {
                shouldCreateUser: false,
                emailRedirectTo: `${new URL(request.url).origin}/auth`,
            },
        });

        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ message: "Check your inbox for a magic link." });
    } catch {
        return NextResponse.json({ error: "Could not send the magic link." }, { status: 500 });
    }
}
