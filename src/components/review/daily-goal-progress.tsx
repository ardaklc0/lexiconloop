import { useAppData } from "@/context/app-data-context";
import { useToday } from "@/hooks/use-clock";
import { calculateStreak, getTodayLogs } from "@/lib/streak";

export function DailyGoalProgress() {
    const { logs, dailyGoal } = useAppData();
    const today = new Date(useToday());
    const todayLogs = getTodayLogs(logs, today);
    const progress = Math.min((todayLogs.length / dailyGoal) * 100, 100);
    const streak = calculateStreak(logs, today);
    return <div className="daily-goal-progress">
        <div className="daily-goal-metric"><div className="daily-goal-copy"><strong>Today&apos;s progress</strong><span>{todayLogs.length} / {dailyGoal} reviews{progress >= 100 ? " · Goal complete" : ""} · {streak}-day streak</span></div><div className="goal-progress-track" role="progressbar" aria-label="Daily review goal" aria-valuemin={0} aria-valuemax={dailyGoal} aria-valuenow={Math.min(todayLogs.length, dailyGoal)}><span style={{ width: `${progress}%` }} /></div></div>
    </div>;
}
