import { redirectTo } from "@/lib/kobo/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
    const supabase = await createSupabaseServerClient();
    if (supabase) await supabase.auth.signOut();
    return redirectTo(request, "/kobo/login");
}
