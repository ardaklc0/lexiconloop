import { useClock } from "@/hooks/use-clock";
import { formatDueIn } from "@/lib/spaced-repetition";

/** Live "In 3h 20min" label; re-renders only when the text changes. */
export function DueIn({ dueAt }: { dueAt: string }) {
    return <>{useClock((now) => formatDueIn(dueAt, new Date(now)))}</>;
}
