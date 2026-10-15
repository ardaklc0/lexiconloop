import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { deleteWorkspace, insertWorkspace, loadUserData, loadWorkspaces } from "@/lib/supabase/data";
import type { Folder, ReviewLog, WordRecord, Workspace } from "@/lib/types";

type SupabaseBrowserClient = NonNullable<ReturnType<typeof createSupabaseBrowserClient>>;
export type CloudContext = { client: SupabaseBrowserClient; userId: string; workspaceId: string };

type AppData = {
    cards: WordRecord[];
    setCards: Dispatch<SetStateAction<WordRecord[]>>;
    folders: Folder[];
    setFolders: Dispatch<SetStateAction<Folder[]>>;
    logs: ReviewLog[];
    setLogs: Dispatch<SetStateAction<ReviewLog[]>>;
    isInitialDataLoading: boolean;
    initialDataError: string;
    cloudMode: boolean;
    syncStatus: string;
    setSyncStatus: Dispatch<SetStateAction<string>>;
    workspace: string;
    workspaceId: string;
    workspaces: Workspace[];
    switchWorkspace: (nextWorkspace: string) => Promise<void>;
    addWorkspace: () => Promise<void>;
    removeCurrentWorkspace: () => Promise<void>;
    signOut: () => Promise<void>;
    getCloudContext: () => CloudContext | null;
    getSession: () => { client: SupabaseBrowserClient; userId: string } | null;
    dailyGoal: number;
    setDailyGoal: Dispatch<SetStateAction<number>>;
    dailyReminderEnabled: boolean;
    setDailyReminderEnabled: Dispatch<SetStateAction<boolean>>;
    dailyReminderTime: string;
    setDailyReminderTime: Dispatch<SetStateAction<string>>;
    reminderStatus: string;
    setReminderStatus: Dispatch<SetStateAction<string>>;
};

const AppDataContext = createContext<AppData | null>(null);

export function useAppData() {
    const value = useContext(AppDataContext);
    if (!value) throw new Error("useAppData must be used inside AppDataProvider.");
    return value;
}

export function AppDataProvider({ children }: { children: ReactNode }) {
    const [cards, setCards] = useState<WordRecord[]>([]);
    const [folders, setFolders] = useState<Folder[]>([]);
    const [logs, setLogs] = useState<ReviewLog[]>([]);
    const [isInitialDataLoading, setIsInitialDataLoading] = useState(true);
    const [initialDataError, setInitialDataError] = useState("");
    const [cloudMode, setCloudMode] = useState(true);
    const [syncStatus, setSyncStatus] = useState("");
    const [workspace, setWorkspace] = useState("");
    const [workspaceId, setWorkspaceId] = useState("");
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [dailyGoal, setDailyGoal] = useState(20);
    const [dailyReminderEnabled, setDailyReminderEnabled] = useState(false);
    const [dailyReminderTime, setDailyReminderTime] = useState("20:00");
    const [reminderStatus, setReminderStatus] = useState("");
    const supabaseRef = useRef<ReturnType<typeof createSupabaseBrowserClient>>(null);
    const userIdRef = useRef<string | null>(null);

    useEffect(() => {
        const savedGoal = Number(window.localStorage.getItem("lexicon-loop-daily-goal"));
        if (savedGoal === 10 || savedGoal === 20 || savedGoal === 30) setDailyGoal(savedGoal);
    }, []);

    useEffect(() => {
        let cancelled = false;

        async function hydrate() {
            let redirecting = false;
            try {
                const supabase = createSupabaseBrowserClient();
                supabaseRef.current = supabase;

                if (!supabase) {
                    redirecting = true;
                    window.location.assign("/auth?error=missing-config");
                    return;
                }

                setCloudMode(true);
                const { data: { user }, error: authError } = await supabase.auth.getUser();
                if (authError) throw authError;
                if (!user) {
                    redirecting = true;
                    window.location.assign("/auth");
                    return;
                }

                userIdRef.current = user.id;
                setSyncStatus("Syncing...");
                const remoteWorkspaces = await loadWorkspaces(supabase, user.id);
                const firstWorkspace = remoteWorkspaces[0];
                if (!firstWorkspace) throw new Error("No workspace found for this account.");
                setWorkspaces(remoteWorkspaces);
                setWorkspaceId(firstWorkspace.id);
                setWorkspace(firstWorkspace.name);
                const remoteData = await loadUserData(supabase, user.id, firstWorkspace.id);
                const { data: reminderSettings, error: reminderSettingsError } = await supabase
                    .from("daily_reminder_settings")
                    .select("enabled, reminder_time, time_zone, daily_goal")
                    .eq("user_id", user.id)
                    .maybeSingle();
                if (!cancelled) {
                    setCards(remoteData.cards);
                    setFolders(remoteData.folders);
                    setLogs(remoteData.logs);
                    if (reminderSettingsError) {
                        setReminderStatus("Apply Supabase migration 007 to enable scheduled push reminders.");
                    } else if (reminderSettings) {
                        setDailyReminderEnabled(reminderSettings.enabled);
                        setDailyReminderTime(String(reminderSettings.reminder_time).slice(0, 5));
                        setDailyGoal(reminderSettings.daily_goal);
                        window.localStorage.setItem("lexicon-loop-daily-goal", String(reminderSettings.daily_goal));
                    }
                    setInitialDataError("");
                    setSyncStatus("Synced");
                }
            } catch (error) {
                if (!cancelled) {
                    const message = error instanceof Error ? error.message : "Could not sync data.";
                    setInitialDataError(message);
                    setSyncStatus(message);
                }
            } finally {
                if (!cancelled && !redirecting) setIsInitialDataLoading(false);
            }
        }

        void hydrate();
        return () => { cancelled = true; };
    }, []);

    const getCloudContext = useCallback(() => {
        const client = supabaseRef.current;
        const userId = userIdRef.current;
        return client && userId && workspaceId ? { client, userId, workspaceId } : null;
    }, [workspaceId]);

    const getSession = useCallback(() => {
        const client = supabaseRef.current;
        const userId = userIdRef.current;
        return client && userId ? { client, userId } : null;
    }, []);

    const switchWorkspace = useCallback(async (nextWorkspace: string) => {
        if (nextWorkspace === workspace) return;
        const selected = workspaces.find((item) => item.name === nextWorkspace);
        if (!cloudMode || !selected || selected.id === workspaceId) return;
        setWorkspace(nextWorkspace);
        setWorkspaceId(selected.id);
        setSyncStatus("Syncing workspace...");
        const client = supabaseRef.current;
        const userId = userIdRef.current;
        if (!client || !userId) return;
        try {
            const remoteData = await loadUserData(client, userId, selected.id);
            setCards(remoteData.cards);
            setFolders(remoteData.folders);
            setLogs(remoteData.logs);
            setSyncStatus("Synced");
        } catch (error) {
            setSyncStatus(error instanceof Error ? error.message : "Workspace could not be loaded.");
        }
    }, [cloudMode, workspace, workspaceId, workspaces]);

    const addWorkspace = useCallback(async () => {
        const name = window.prompt("Workspace name");
        if (!name?.trim()) return;
        const cloud = getCloudContext();
        try {
            if (!cloud) throw new Error("Supabase is required to create a workspace.");
            const created = await insertWorkspace(cloud.client, cloud.userId, name.trim());
            setWorkspaces((items) => [...items, created]);
            const remoteData = await loadUserData(cloud.client, cloud.userId, created.id);
            setWorkspaceId(created.id);
            setWorkspace(created.name);
            setCards(remoteData.cards);
            setFolders(remoteData.folders);
            setLogs(remoteData.logs);
            setSyncStatus("Workspace created");
        } catch (error) {
            setSyncStatus(error instanceof Error ? error.message : "Workspace could not be created.");
        }
    }, [getCloudContext]);

    const removeCurrentWorkspace = useCallback(async () => {
        if (workspaces.length <= 1) {
            setSyncStatus("Keep at least one workspace.");
            return;
        }
        const cloud = getCloudContext();
        if (!cloud || !window.confirm(`Delete workspace "${workspace}" and its words?`)) return;
        const remaining = workspaces.filter((item) => item.id !== cloud.workspaceId);
        try {
            await deleteWorkspace(cloud.client, cloud.userId, cloud.workspaceId);
            const nextWorkspace = remaining[0];
            const remoteData = await loadUserData(cloud.client, cloud.userId, nextWorkspace.id);
            setWorkspaces(remaining);
            setWorkspaceId(nextWorkspace.id);
            setWorkspace(nextWorkspace.name);
            setCards(remoteData.cards);
            setFolders(remoteData.folders);
            setLogs(remoteData.logs);
            setSyncStatus("Workspace deleted");
        } catch (error) {
            setSyncStatus(error instanceof Error ? error.message : "Workspace could not be deleted.");
        }
    }, [getCloudContext, workspace, workspaces]);

    const signOut = useCallback(async () => {
        const cloud = getCloudContext();
        if (cloud) await cloud.client.auth.signOut();
        window.location.assign("/auth");
    }, [getCloudContext]);

    const value = useMemo<AppData>(() => ({
        cards, setCards, folders, setFolders, logs, setLogs,
        isInitialDataLoading, initialDataError, cloudMode, syncStatus, setSyncStatus,
        workspace, workspaceId, workspaces, switchWorkspace, addWorkspace, removeCurrentWorkspace, signOut,
        getCloudContext, getSession,
        dailyGoal, setDailyGoal, dailyReminderEnabled, setDailyReminderEnabled, dailyReminderTime, setDailyReminderTime, reminderStatus, setReminderStatus,
    }), [addWorkspace, cards, cloudMode, dailyGoal, dailyReminderEnabled, dailyReminderTime, folders, getCloudContext, getSession, initialDataError, isInitialDataLoading, logs, reminderStatus, removeCurrentWorkspace, signOut, switchWorkspace, syncStatus, workspace, workspaceId, workspaces]);

    return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}
