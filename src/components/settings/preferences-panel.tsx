import { useEffect, useState } from "react";
import { Bell, CirclePlus, Keyboard, LogOut, ShieldCheck } from "lucide-react";
import { useAppData } from "@/context/app-data-context";
import { usePushReminders } from "@/hooks/use-push-reminders";

export function PreferencesPanel({ darkMode, onDarkModeChange }: { darkMode: boolean; onDarkModeChange: (darkMode: boolean) => void }) {
    const { cloudMode, workspace, workspaces, switchWorkspace, addWorkspace, signOut, syncStatus, dailyGoal, dailyReminderEnabled, dailyReminderTime, reminderStatus, setReminderStatus } = useAppData();
    const { toggleDailyReminder, updateDailyReminderTime, updateDailyGoal } = usePushReminders();
    const [dailyGoalInput, setDailyGoalInput] = useState(String(dailyGoal));

    useEffect(() => {
        setDailyGoalInput(String(dailyGoal));
    }, [dailyGoal]);

    return <section className="surface-panel">
        <div className="panel-heading"><h2>Learning setup</h2><ShieldCheck size={17} color="var(--sage)" /></div>
        <div className="settings-list">
            <div className="setting-row"><div className="setting-copy"><strong>Workspace</strong><span>Switch your learning shelf.</span></div><div className="setting-control"><select value={workspace} onChange={(event) => void switchWorkspace(event.target.value)}>{(cloudMode ? workspaces.map((item) => item.name) : ["Arda's notebook", "Travel words", "Reading shelf"]).map((item) => <option key={item}>{item}</option>)}</select><button className="icon-button" onClick={() => void addWorkspace()} aria-label="Create workspace"><CirclePlus size={15} /></button></div></div>
            <div className="setting-row"><div className="setting-copy"><strong>Daily review goal</strong><span>Enter any whole number from 1 to 32767.</span></div><input className="daily-goal-input" type="number" min={1} max={32767} step={1} aria-label="Daily review goal" value={dailyGoalInput} onChange={(event) => setDailyGoalInput(event.currentTarget.value)} onBlur={() => { const goal = Number(dailyGoalInput); if (Number.isInteger(goal) && goal >= 1 && goal <= 32767) { setDailyGoalInput(String(goal)); void updateDailyGoal(goal); } else { setDailyGoalInput(String(dailyGoal)); setReminderStatus("Enter a whole-number goal from 1 to 32767."); } }} /></div>
            <div className="setting-row"><div className="setting-copy"><strong>Daily push reminder</strong><span>Sent at this time if today&apos;s review goal is unfinished.</span></div><div className="setting-control"><input className="reminder-time-input" type="time" aria-label="Reminder time" value={dailyReminderTime} onChange={(event) => void updateDailyReminderTime(event.target.value)} /><button type="button" className="ghost-button" aria-pressed={dailyReminderEnabled} onClick={() => void toggleDailyReminder()}><Bell size={14} />{dailyReminderEnabled ? "Turn off" : "Enable"}</button></div></div>
            {reminderStatus && <p className="stats-note" role="status" aria-live="polite">{reminderStatus}</p>}
            <p className="stats-note">Push reminders can arrive while the app is closed. On iPhone or iPad, add Lexicon Loop to the Home Screen first.</p>
            <div className="setting-row"><div className="setting-copy"><strong>Dark mode</strong><span>Use a lower-light palette.</span></div><button className={`toggle ${darkMode ? "on" : ""}`} onClick={() => onDarkModeChange(!darkMode)} aria-label="Toggle dark mode"><i /></button></div>
            <div className="setting-row"><div className="setting-copy"><strong>Sync status</strong><span>{syncStatus || (cloudMode ? "Connected to Supabase" : "Local demo mode")}</span></div><span className="state-tag state-review">{cloudMode ? "Cloud" : "Local"}</span></div>
            <div className="setting-row"><div className="setting-copy"><strong>Keyboard shortcuts</strong><span>Reveal with Space, rate with 1-4.</span></div><Keyboard size={18} color="var(--muted)" /></div>
            <div className="setting-row"><div className="setting-copy"><strong>Account</strong><span>Sign out from this workspace.</span></div><button className="ghost-button" onClick={() => void signOut()}><LogOut size={14} /> Sign out</button></div>
        </div>
    </section>;
}
