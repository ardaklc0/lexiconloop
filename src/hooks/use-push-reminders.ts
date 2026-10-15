import { useAppData } from "@/context/app-data-context";

const decodeVapidPublicKey = (value: string) => {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return Uint8Array.from(window.atob(padded), (character) => character.charCodeAt(0));
};

export function usePushReminders() {
    const { getSession, dailyGoal, setDailyGoal, dailyReminderEnabled, setDailyReminderEnabled, dailyReminderTime, setDailyReminderTime, setReminderStatus } = useAppData();

    async function saveDailyReminderSettings(enabled: boolean, time: string, goal: number) {
        const session = getSession();
        if (!session) throw new Error("Sign in to save reminder settings.");
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        const { error } = await session.client.from("daily_reminder_settings").upsert({
            user_id: session.userId,
            enabled,
            reminder_time: time,
            time_zone: timeZone,
            daily_goal: goal,
        }, { onConflict: "user_id" });
        if (error) throw new Error(error.message);
    }

    async function toggleDailyReminder() {
        if (dailyReminderEnabled) {
            try {
                await saveDailyReminderSettings(false, dailyReminderTime, dailyGoal);
                setDailyReminderEnabled(false);
                setReminderStatus("Daily push reminder turned off.");
            } catch (error) {
                setReminderStatus(error instanceof Error ? error.message : "Could not turn off the reminder.");
            }
            return;
        }

        if (typeof Notification === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
            setReminderStatus("This browser does not support push notifications.");
            return;
        }
        if (!window.isSecureContext) {
            setReminderStatus("Push reminders require HTTPS or localhost.");
            return;
        }
        const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
        if (!vapidPublicKey) {
            setReminderStatus("Finish the VAPID and Supabase setup before enabling push reminders.");
            return;
        }

        try {
            const permission = await Notification.requestPermission();
            if (permission !== "granted") {
                setReminderStatus(permission === "denied" ? "Notifications are blocked in your browser settings." : "Allow notifications to enable reminders.");
                return;
            }

            const registration = await navigator.serviceWorker.register("/reminder-sw.js");
            await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: decodeVapidPublicKey(vapidPublicKey) as BufferSource,
            });
            const details = subscription.toJSON();
            if (!details.keys?.auth || !details.keys.p256dh) throw new Error("The browser returned an incomplete push subscription.");

            const session = getSession();
            if (!session) throw new Error("Sign in to enable push reminders.");
            const { error: subscriptionError } = await session.client.from("push_subscriptions").upsert({
                user_id: session.userId,
                endpoint: subscription.endpoint,
                p256dh: details.keys.p256dh,
                auth: details.keys.auth,
            }, { onConflict: "user_id,endpoint" });
            if (subscriptionError) throw new Error(subscriptionError.message);

            await saveDailyReminderSettings(true, dailyReminderTime, dailyGoal);
            setDailyReminderEnabled(true);
            setReminderStatus("Daily push reminder enabled.");
        } catch (error) {
            setReminderStatus(error instanceof Error ? error.message : "Could not enable push reminders.");
        }
    }

    async function updateDailyReminderTime(time: string) {
        setDailyReminderTime(time);
        try {
            await saveDailyReminderSettings(dailyReminderEnabled, time, dailyGoal);
            setReminderStatus("Reminder time saved.");
        } catch (error) {
            setReminderStatus(error instanceof Error ? error.message : "Could not save reminder time.");
        }
    }

    async function updateDailyGoal(goal: number) {
        if (!Number.isInteger(goal) || goal < 1 || goal > 32767) {
            setReminderStatus("Enter a whole-number goal between 1 and 32767.");
            return;
        }
        setDailyGoal(goal);
        window.localStorage.setItem("lexicon-loop-daily-goal", String(goal));
        try {
            await saveDailyReminderSettings(dailyReminderEnabled, dailyReminderTime, goal);
        } catch (error) {
            setReminderStatus(error instanceof Error ? error.message : "Could not save daily goal.");
        }
    }

    return { toggleDailyReminder, updateDailyReminderTime, updateDailyGoal };
}
