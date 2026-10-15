import { useDueCount } from "@/hooks/use-clock";
import type { WordRecord } from "@/lib/types";

/** Live count of cards that are due now. */
export function DueCount({ cards }: { cards: WordRecord[] }) {
    return <>{useDueCount(cards)}</>;
}
