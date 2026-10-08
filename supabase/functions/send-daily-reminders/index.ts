import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import * as webpush from "jsr:@negrel/webpush@0.5.0";

type DueReminder = {
    user_id: string;
    time_zone: string;
    daily_goal: number;
    local_date: string;
};

type PushSubscriptionRow = {
    id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });

function getServiceRoleKey() {
    const legacyKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (legacyKey) return legacyKey;

    const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>;
    const key = secretKeys.default;
    if (!key) throw new Error("Supabase service key is unavailable.");
    return key;
}

Deno.serve(async (request) => {
    if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

    const expectedSecret = Deno.env.get("PUSH_CRON_SECRET");
    if (!expectedSecret || request.headers.get("x-cron-secret") !== expectedSecret) {
        return jsonResponse({ error: "Unauthorized." }, 401);
    }

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const vapidKeysValue = Deno.env.get("VAPID_KEYS");
        const contactEmail = Deno.env.get("VAPID_CONTACT_EMAIL");
        if (!supabaseUrl || !vapidKeysValue || !contactEmail) {
            throw new Error("Push reminder secrets are not configured.");
        }

        const supabase = createClient(supabaseUrl, getServiceRoleKey());
        const { data: dueReminders, error: claimError } = await supabase.rpc("claim_due_daily_reminders");
        if (claimError) throw claimError;

        const reminders = (dueReminders ?? []) as DueReminder[];
        if (!reminders.length) return jsonResponse({ sent: 0, checked: true });

        const vapidKeys = await webpush.importVapidKeys(JSON.parse(vapidKeysValue), { extractable: false });
        const applicationServer = await webpush.ApplicationServer.new({
            contactInformation: `mailto:${contactEmail}`,
            vapidKeys,
        });

        let sent = 0;
        let removed = 0;
        let failed = 0;

        for (const reminder of reminders) {
            let reminderSent = 0;
            let reminderFailed = false;
            const { data: subscriptions, error: subscriptionsError } = await supabase
                .from("push_subscriptions")
                .select("id, endpoint, p256dh, auth")
                .eq("user_id", reminder.user_id);

            if (subscriptionsError) {
                failed += 1;
                reminderFailed = true;
                await supabase
                    .from("daily_reminder_settings")
                    .update({ last_sent_on: null })
                    .eq("user_id", reminder.user_id)
                    .eq("last_sent_on", reminder.local_date);
                continue;
            }

            for (const subscription of (subscriptions ?? []) as PushSubscriptionRow[]) {
                try {
                    const subscriber = applicationServer.subscribe({
                        endpoint: subscription.endpoint,
                        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
                    });
                    const words = Math.min(5, reminder.daily_goal);
                    await subscriber.pushTextMessage(JSON.stringify({
                        title: "A quick review is waiting",
                        body: `Take a minute for ${words} words today.`,
                        url: "/",
                    }), { ttl: 3600 });
                    sent += 1;
                    reminderSent += 1;
                } catch (error) {
                    if (error instanceof webpush.PushMessageError && error.isGone()) {
                        const { error: deleteError } = await supabase
                            .from("push_subscriptions")
                            .delete()
                            .eq("id", subscription.id);
                        if (!deleteError) removed += 1;
                    } else {
                        failed += 1;
                        reminderFailed = true;
                    }
                }
            }

            if (reminderFailed && !reminderSent) {
                await supabase
                    .from("daily_reminder_settings")
                    .update({ last_sent_on: null })
                    .eq("user_id", reminder.user_id)
                    .eq("last_sent_on", reminder.local_date);
            }
        }

        return jsonResponse({ sent, removed, failed });
    } catch (error) {
        console.error("Daily push delivery failed:", error);
        return jsonResponse({ error: error instanceof Error ? error.message : "Push delivery failed." }, 500);
    }
});