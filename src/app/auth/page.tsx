"use client";

import { useEffect, useState } from "react";
import { ArrowRight, BookOpenCheck, LockKeyhole, Mail } from "lucide-react";
import { applyDeviceTheme, watchDeviceTheme } from "@/lib/device-theme";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function AuthPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => watchDeviceTheme(applyDeviceTheme), []);

    useEffect(() => {
        const supabase = createSupabaseBrowserClient();
        const error = new URLSearchParams(window.location.search).get("error");
        if (error === "not-allowed") {
            setMessage("This email is not allowed to use this workspace.");
        } else if (error === "missing-config" || !supabase) {
            setMessage("Supabase is not configured. Add the NEXT_PUBLIC Supabase variables and restart the dev server.");
        }
        if (!supabase) return;
        void supabase.auth.getSession().then(({ data }) => {
            if (data.session) window.location.assign("/");
        });
    }, []);

    async function signIn(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const supabase = createSupabaseBrowserClient();
        if (!supabase) {
            setMessage("Supabase is not configured. Add the environment variables and restart the dev server.");
            return;
        }
        setLoading(true);
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) {
            setMessage(error.message);
        } else {
            window.location.assign("/");
        }
        setLoading(false);
    }

    return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}><section style={{ width: "min(100%, 420px)", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, padding: 28 }}><div className="brand" style={{ padding: 0, marginBottom: 32 }}><div className="brand-mark"><BookOpenCheck size={17} /></div><span className="brand-name">Lexicon Loop</span></div><div className="eyebrow">Sign in</div><h1 style={{ fontFamily: "Fraunces, serif", fontSize: 34, margin: "8px 0" }}>Keep the words close.</h1><form className="form-grid" onSubmit={signIn}><div className="field"><label htmlFor="email">Email address</label><div className="input-with-action"><input id="email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /><span style={{ display: "grid", placeItems: "center", padding: "0 11px", color: "var(--muted)" }}><Mail size={15} /></span></div></div><div className="field"><label htmlFor="password">Password</label><div className="input-with-action"><input id="password" type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" /><span style={{ display: "grid", placeItems: "center", padding: "0 11px", color: "var(--muted)" }}><LockKeyhole size={15} /></span></div></div><button className="primary-button" disabled={loading}>{loading ? "Signing in..." : "Sign in"}<ArrowRight size={15} /></button></form>{message && <p style={{ color: "var(--red)", fontSize: 12, lineHeight: 1.5, margin: "18px 0 0" }}>{message}</p>}</section></main>;
}
