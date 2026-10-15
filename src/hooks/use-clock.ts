import { useMemo, useSyncExternalStore } from "react";
import type { WordRecord } from "@/lib/types";

// One shared one-second ticker. Components subscribe through a selector and only
// re-render when the selected value changes, e.g. a countdown label or a due count.
let currentTime = Date.now();
const listeners = new Set<() => void>();
let timer: number | undefined;

function tick() {
    currentTime = Date.now();
    listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    if (listeners.size === 1) {
        currentTime = Date.now();
        timer = window.setInterval(tick, 1000);
        window.addEventListener("focus", tick);
        document.addEventListener("visibilitychange", tick);
    }
    return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        window.clearInterval(timer);
        window.removeEventListener("focus", tick);
        document.removeEventListener("visibilitychange", tick);
    };
}

/** `select` should return a primitive so unchanged values skip the re-render. */
export function useClock<T>(select: (now: number) => T): T {
    return useSyncExternalStore(subscribe, () => select(currentTime), () => select(currentTime));
}

export const startOfDay = (time: number) => {
    const date = new Date(time);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
};

/** Start of the current day; changes only at midnight. */
export const useToday = () => useClock(startOfDay);

const countPassed = (sortedTimes: number[], now: number) => {
    let low = 0;
    let high = sortedTimes.length;
    while (low < high) {
        const middle = (low + high) >> 1;
        if (sortedTimes[middle] <= now) low = middle + 1;
        else high = middle;
    }
    return low;
};

const useSortedDueTimes = (cards: WordRecord[]) =>
    useMemo(() => cards.map((card) => new Date(card.dueAt).getTime()).sort((first, second) => first - second), [cards]);

/** Number of cards whose due time has passed; changes only when another card becomes due. */
export function useDueCount(cards: WordRecord[]) {
    const dueTimes = useSortedDueTimes(cards);
    return useClock((now) => countPassed(dueTimes, now));
}

/**
 * The most recent due time that has passed. Every card's due state is the same at this
 * moment as it is right now, so it can stand in for "now" without changing every second.
 */
export function useLatestPassedDueTime(cards: WordRecord[]) {
    const dueTimes = useSortedDueTimes(cards);
    return useClock((now) => dueTimes[countPassed(dueTimes, now) - 1] ?? 0);
}
