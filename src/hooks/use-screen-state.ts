import { useCallback, useSyncExternalStore, type SetStateAction } from "react";

// State for a screen that must survive while the screen is closed (filters, drafts,
// in-flight requests), so it is still there when the user navigates back.
export type ScreenState<T> = { key: string; initialValue: T };

const values = new Map<string, unknown>();
const listeners = new Map<string, Set<() => void>>();

export const screenState = <T>(key: string, initialValue: T): ScreenState<T> => ({ key, initialValue });

export function getScreenState<T>(state: ScreenState<T>): T {
    if (!values.has(state.key)) values.set(state.key, state.initialValue);
    return values.get(state.key) as T;
}

export function setScreenState<T>(state: ScreenState<T>, next: SetStateAction<T>) {
    const previous = getScreenState(state);
    const resolved = typeof next === "function" ? (next as (value: T) => T)(previous) : next;
    if (Object.is(previous, resolved)) return;
    values.set(state.key, resolved);
    listeners.get(state.key)?.forEach((listener) => listener());
}

export function useScreenState<T>(state: ScreenState<T>) {
    const { key } = state;
    const subscribe = useCallback((listener: () => void) => {
        const keyListeners = listeners.get(key) ?? new Set<() => void>();
        keyListeners.add(listener);
        listeners.set(key, keyListeners);
        return () => { keyListeners.delete(listener); };
    }, [key]);
    const getSnapshot = () => getScreenState(state);
    const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    // Descriptors are module constants, so the setter stays stable across renders.
    const setValue = useCallback((next: SetStateAction<T>) => setScreenState(state, next), [state]);
    return [value, setValue] as const;
}
