"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ArrowLeft,
    ArrowRight,
    BarChart3,
    BookOpenCheck,
    Check,
    CirclePlus,
    ChevronDown,
    Clock3,
    Eye,
    Flame,
    FolderOpen,
    Keyboard,
    Languages,
    ListChecks,
    LogOut,
    Menu,
    Pencil,
    Search,
    Settings2,
    ShieldCheck,
    Sparkles,
    Trash2,
    Volume2,
    X,
} from "lucide-react";
import { calculateNextReview, formatDueIn, sortReviewQueue } from "@/lib/spaced-repetition";
import { applyDeviceTheme, watchDeviceTheme } from "@/lib/device-theme";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { deleteFolder, deleteWord, deleteWorkspace, insertFolder, insertWord, insertWorkspace, loadUserData, loadWorkspaces, saveReview, updateFolder, updateWord } from "@/lib/supabase/data";
import type { CardState, CefrLevel, Folder, ReviewLog, ReviewRating, WordRecord, Workspace } from "@/lib/types";

type View = "review" | "words" | "folders" | "statistics" | "settings" | "add" | "add-folder" | "word-detail";
type Filter = "all" | CardState;
type ReviewFilterOption = {
    value: string;
    label: string;
    sourceLanguage?: string;
    folderId?: string;
};
type WordForm = {
    word: string;
    meaning: string;
    exampleSentence: string;
    folderId: string;
    sourceLanguage: string;
    targetLanguage: string;
    cefrLevel: CefrLevel | "";
    notes: string;
};
type QuizQuestion = {
    type: "multiple-choice" | "fill-blank";
    prompt: string;
    options?: string[];
    answer: string;
    explanation: string;
    word: string;
};

const languageOptions = ["German", "Turkish", "English", "French"];
const cefrLevels: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1"];

const navItems: Array<{ id: View; label: string; icon: typeof BookOpenCheck }> = [
    { id: "review", label: "Review", icon: BookOpenCheck },
    { id: "words", label: "Words", icon: Languages },
    { id: "folders", label: "Folders", icon: FolderOpen },
    { id: "statistics", label: "Statistics", icon: BarChart3 },
];

const titleForView: Record<View, string> = {
    review: "Hello there",
    words: "Your vocabulary",
    folders: "Your collections",
    statistics: "A little progress",
    settings: "Your preferences",
    add: "Add a word",
    "add-folder": "New folder",
    "word-detail": "Word details",
};

const subtitleForView: Record<View, string> = {
    add: "Give it just enough context to stick.",
    "add-folder": "Keep a small set of related words together.",
    review: "A few deliberate minutes is enough for today.",
    words: "Every word has a place in your memory.",
    folders: "Keep related words close together.",
    statistics: "Small repetitions become visible over time.",
    settings: "Make the rhythm fit your day.",
    "word-detail": "A closer look at this word.",
};

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const calculateStreak = (logs: ReviewLog[], now = new Date()) => {
    const reviewedDays = new Set(logs.map((log) => {
        const date = new Date(log.reviewedAt);
        return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    }));
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayKey = today.getTime();
    const yesterdayKey = new Date(today.getTime() - 86_400_000).getTime();
    if (!reviewedDays.has(todayKey) && !reviewedDays.has(yesterdayKey)) return 0;

    let streak = 0;
    let cursor = reviewedDays.has(todayKey) ? today : new Date(today.getTime() - 86_400_000);
    while (reviewedDays.has(cursor.getTime())) {
        streak += 1;
        cursor = new Date(cursor.getTime() - 86_400_000);
    }
    return streak;
};

const sameId = (first: string | null | undefined, second: string | null | undefined) =>
    Boolean(first && second && first.trim().toLowerCase() === second.trim().toLowerCase());

const normalizeQuizAnswer = (value: string) =>
    value.normalize("NFKC").trim().toLocaleLowerCase().replace(/^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu, "").replace(/\s+/g, " ");

export default function FlashcardApp() {
    const [activeView, setActiveView] = useState<View>("review");
    const [cards, setCards] = useState<WordRecord[]>([]);
    const [folders, setFolders] = useState<Folder[]>([]);
    const [logs, setLogs] = useState<ReviewLog[]>([]);
    const [cloudMode, setCloudMode] = useState(true);
    const [syncStatus, setSyncStatus] = useState("");
    const [isFlipped, setIsFlipped] = useState(false);
    const [returnView, setReturnView] = useState<View>("words");
    const [showMobileMenu, setShowMobileMenu] = useState(false);
    const [editingWordId, setEditingWordId] = useState<string | null>(null);
    const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
    const [folderForm, setFolderForm] = useState({ name: "", description: "", color: "#dcebe1" });
    const [darkMode, setDarkMode] = useState(false);
    const [now, setNow] = useState(() => Date.now());
    const [workspace, setWorkspace] = useState("");
    const [workspaceId, setWorkspaceId] = useState("");
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
    const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
    const [detailReturnView, setDetailReturnView] = useState<View>("words");
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<Filter>("all");
    const [reviewFilter, setReviewFilter] = useState("all");
    const [generating, setGenerating] = useState(false);
    const [generationStatus, setGenerationStatus] = useState("");
    const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
    const [quizIndex, setQuizIndex] = useState(0);
    const [quizAnswer, setQuizAnswer] = useState("");
    const [quizSubmitted, setQuizSubmitted] = useState(false);
    const [quizGenerating, setQuizGenerating] = useState(false);
    const [quizStatus, setQuizStatus] = useState("");
    const [showQuiz, setShowQuiz] = useState(false);
    const [quizCount, setQuizCount] = useState(5);
    const [quizSource, setQuizSource] = useState<"recent" | "random">("recent");
    const [form, setForm] = useState<WordForm>({ word: "", meaning: "", exampleSentence: "", folderId: "", sourceLanguage: "German", targetLanguage: "Turkish", cefrLevel: "", notes: "" });
    const touchStart = useRef<{ x: number; y: number } | null>(null);
    const supabaseRef = useRef<ReturnType<typeof createSupabaseBrowserClient>>(null);
    const userIdRef = useRef<string | null>(null);

    useEffect(() => {
        return watchDeviceTheme((theme) => {
            setDarkMode(theme === "dark");
            applyDeviceTheme(theme);
        });
    }, []);

    useEffect(() => {
        applyDeviceTheme(darkMode ? "dark" : "light");
    }, [darkMode]);

    useEffect(() => {
        const updateNow = () => setNow(Date.now());
        const timer = window.setInterval(updateNow, 1000);
        window.addEventListener("focus", updateNow);
        document.addEventListener("visibilitychange", updateNow);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener("focus", updateNow);
            document.removeEventListener("visibilitychange", updateNow);
        };
    }, []);

    useEffect(() => {
        const preventGestureZoom = (event: Event) => event.preventDefault();
        document.addEventListener("gesturestart", preventGestureZoom, { passive: false });
        document.addEventListener("gesturechange", preventGestureZoom, { passive: false });
        document.addEventListener("gestureend", preventGestureZoom, { passive: false });

        return () => {
            document.removeEventListener("gesturestart", preventGestureZoom);
            document.removeEventListener("gesturechange", preventGestureZoom);
            document.removeEventListener("gestureend", preventGestureZoom);
        };
    }, []);

    useEffect(() => {
        const picker = document.querySelector<HTMLElement>(".workspace-picker");
        if (!picker) return;
        const profile = document.querySelector<HTMLElement>(".sidebar-profile");
        profile?.remove();
        let selector: HTMLSelectElement;
        if (picker instanceof HTMLSelectElement) {
            selector = picker;
        } else {
            selector = document.createElement("select");
            selector.className = picker.className;
            picker.replaceWith(selector);
        }
        selector.innerHTML = workspaces.map((item) => `<option value="${item.name.replace(/"/g, "&quot;")}">${item.name}</option>`).join("");
        selector.value = workspace;
        selector.setAttribute("aria-label", "Select workspace");
        const selectWorkspace = () => void switchWorkspace(selector.value);
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "workspace-delete-button";
        deleteButton.textContent = workspaces.length > 1 ? "Delete workspace" : "Keep one workspace";
        deleteButton.disabled = workspaces.length <= 1;
        deleteButton.addEventListener("click", () => void removeCurrentWorkspace());
        selector.addEventListener("change", selectWorkspace);
        selector.insertAdjacentElement("afterend", deleteButton);
        return () => {
            selector.removeEventListener("change", selectWorkspace);
            deleteButton.remove();
        };
    }, [workspace, workspaces]);

    useEffect(() => {
        const shell = document.querySelector<HTMLElement>(".app-shell");
        const topButton = document.querySelector<HTMLButtonElement>(".topbar-mobile .icon-button");
        const mobileNavButtons = document.querySelectorAll<HTMLButtonElement>(".sidebar .nav-button");
        if (!shell || !topButton) return;
        const toggleMenu = (event: Event) => {
            event.preventDefault();
            event.stopPropagation();
            topButton.setAttribute("aria-label", "Open menu");
            setShowMobileMenu((value) => !value);
        };
        const closeMenu = () => setShowMobileMenu(false);
        topButton.addEventListener("click", toggleMenu, true);
        mobileNavButtons.forEach((button) => button.addEventListener("click", closeMenu, true));
        shell.classList.toggle("mobile-menu-open", showMobileMenu);
        return () => {
            topButton.removeEventListener("click", toggleMenu, true);
            mobileNavButtons.forEach((button) => button.removeEventListener("click", closeMenu, true));
            shell.classList.remove("mobile-menu-open");
        };
    }, [showMobileMenu]);

    useEffect(() => {
        let cancelled = false;

        async function hydrate() {
            const supabase = createSupabaseBrowserClient();
            supabaseRef.current = supabase;

            if (!supabase) {
                window.location.assign("/auth?error=missing-config");
                return;
            }

            setCloudMode(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                window.location.assign("/auth");
                return;
            }

            userIdRef.current = user.id;
            setSyncStatus("Syncing...");
            try {
                const remoteWorkspaces = await loadWorkspaces(supabase, user.id);
                const firstWorkspace = remoteWorkspaces[0];
                if (!firstWorkspace) throw new Error("No workspace found for this account.");
                setWorkspaces(remoteWorkspaces);
                setWorkspaceId(firstWorkspace.id);
                setWorkspace(firstWorkspace.name);
                const remoteData = await loadUserData(supabase, user.id, firstWorkspace.id);
                if (!cancelled) {
                    setCards(remoteData.cards);
                    setFolders(remoteData.folders);
                    setLogs(remoteData.logs);
                    setSyncStatus("Synced");
                }
            } catch (error) {
                if (!cancelled) setSyncStatus(error instanceof Error ? error.message : "Could not sync data.");
            }
        }

        void hydrate();
        return () => { cancelled = true; };
    }, []);

    const reviewFilterOptions = useMemo<ReviewFilterOption[]>(() => {
        const languages = Array.from(new Set(cards.map((card) => card.sourceLanguage).filter(Boolean))).sort();
        return [
            { value: "all", label: "All" },
            ...languages.map((language) => ({ value: `language:${language}`, label: language, sourceLanguage: language })),
            ...folders.map((folder) => ({ value: `folder:${folder.id}`, label: folder.name, folderId: folder.id })),
        ];
    }, [cards, folders]);
    const selectedReviewFilter = reviewFilterOptions.find((option) => option.value === reviewFilter);
    const reviewCards = useMemo(() => {
        if (!selectedReviewFilter?.sourceLanguage && !selectedReviewFilter?.folderId) return cards;
        if (selectedReviewFilter.sourceLanguage) return cards.filter((card) => card.sourceLanguage === selectedReviewFilter.sourceLanguage);
        return cards.filter((card) => sameId(card.folderId, selectedReviewFilter.folderId));
    }, [cards, selectedReviewFilter]);
    const queue = useMemo(() => sortReviewQueue(reviewCards, new Date(now)), [reviewCards, now]);
    const currentCard = queue[0];
    const quizCards = useMemo(() => [...cards].sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime()), [cards]);
    const currentQuizQuestion = quizQuestions[quizIndex];
    const dueCount = queue.length;
    const learnedCount = cards.filter((card) => card.state === "mastered").length;
    const todayLogs = logs.filter((log) => new Date(log.reviewedAt).toDateString() === new Date().toDateString());
    const visibleCards = cards.filter((card) => {
        const matchesSearch = `${card.word} ${card.meaning}`.toLowerCase().includes(search.toLowerCase());
        return matchesSearch && (filter === "all" || card.state === filter);
    });
    const getFolderCards = (folderId: string) => cards.filter((card) => sameId(card.folderId, folderId));

    const getCloudContext = useCallback(() => {
        const client = supabaseRef.current;
        const userId = userIdRef.current;
        return client && userId && workspaceId ? { client, userId, workspaceId } : null;
    }, [workspaceId]);

    function speakWord(word: string, language: string) {
        if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(word);
        utterance.lang = ({ German: "de-DE", Turkish: "tr-TR", English: "en-US", French: "fr-FR" } as Record<string, string>)[language] ?? "en-US";
        utterance.rate = 0.85;
        window.speechSynthesis.speak(utterance);
    }

    const handleReview = useCallback((rating: ReviewRating) => {
        if (!currentCard || !isFlipped) return;
        const reviewedAt = new Date();
        const next = calculateNextReview(currentCard, rating, reviewedAt);
        const reviewLog = { id: makeId(), wordId: currentCard.id, rating, reviewedAt: reviewedAt.toISOString() };
        setCards((previous) => previous.map((card) => card.id === currentCard.id ? { ...card, ...next } : card));
        setLogs((previous) => [...previous, reviewLog]);
        setIsFlipped(false);

        const cloud = getCloudContext();
        if (!cloud) return;
        setSyncStatus("Saving review...");
        void saveReview(cloud.client, cloud.userId, cloud.workspaceId, currentCard, rating, next)
            .then(() => setSyncStatus("Synced"))
            .catch((error: unknown) => {
                setCards((previous) => previous.map((card) => card.id === currentCard.id ? currentCard : card));
                setLogs((previous) => previous.filter((log) => log.id !== reviewLog.id));
                setSyncStatus(error instanceof Error ? error.message : "Review could not be saved.");
            });
    }, [currentCard, getCloudContext, isFlipped]);

    useEffect(() => {
        const handleKey = (event: KeyboardEvent) => {
            if (activeView === "add") return;
            if (activeView !== "review") return;
            if (event.key === " " || event.key === "Enter") {
                event.preventDefault();
                if (currentCard) setIsFlipped((value) => !value);
            }
            if (!isFlipped) return;
            if (event.key === "1" || event.key === "ArrowLeft") handleReview("forgot");
            if (event.key === "2") handleReview("hard");
            if (event.key === "3" || event.key === "ArrowRight") handleReview("good");
            if (event.key === "4") handleReview("easy");
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [activeView, currentCard, handleReview, isFlipped]);

    useEffect(() => {
        if (activeView !== "review") setShowQuiz(false);
    }, [activeView]);

    useEffect(() => {
        if (activeView !== "review") return;
        const eyebrow = document.querySelector<HTMLElement>(".page-header .eyebrow");
        if (eyebrow) eyebrow.textContent = new Date(now).toLocaleDateString("en-US", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
    }, [activeView, now]);

    function openAddModal() {
        setSelectedWordId(null);
        setEditingWordId(null);
        setForm((previous) => ({ word: "", meaning: "", exampleSentence: "", folderId: previous.folderId || folders[0]?.id || "", sourceLanguage: previous.sourceLanguage, targetLanguage: previous.targetLanguage, cefrLevel: "", notes: "" }));
        setGenerationStatus("");
        setReturnView(activeView === "add" ? returnView : activeView);
        setActiveView("add");
    }

    function openEditWord(card: WordRecord) {
        setEditingWordId(card.id);
        setForm({ word: card.word, meaning: card.meaning, exampleSentence: card.exampleSentence ?? "", folderId: card.folderId, sourceLanguage: card.sourceLanguage, targetLanguage: card.targetLanguage, cefrLevel: card.cefrLevel ?? "", notes: card.notes ?? "" });
        setGenerationStatus("");
        setReturnView(activeView === "add" ? returnView : activeView);
        setActiveView("add");
    }

    function openWordDetail(card: WordRecord, fromView: View = activeView) {
        setSelectedWordId(card.id);
        setDetailReturnView(fromView === "word-detail" ? detailReturnView : fromView);
        setActiveView("words");
    }

    async function addWord(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!form.word.trim()) return;
        const now = new Date().toISOString();
        const cloud = getCloudContext();
        if (editingWordId) {
            const previous = cards.find((card) => card.id === editingWordId);
            if (!previous) return;
            const updated = { ...previous, word: form.word.trim(), meaning: form.meaning.trim(), exampleSentence: form.exampleSentence.trim() || undefined, folderId: form.folderId, sourceLanguage: form.sourceLanguage, targetLanguage: form.targetLanguage, cefrLevel: form.cefrLevel || undefined, notes: form.notes.trim() || undefined };
            setCards((items) => items.map((card) => card.id === editingWordId ? updated : card));
            setActiveView(returnView);
            if (cloud) {
                setSyncStatus("Saving changes...");
                try {
                    await updateWord(cloud.client, cloud.userId, cloud.workspaceId, editingWordId, updated);
                    setSyncStatus("Synced");
                } catch (error) {
                    setCards((items) => items.map((card) => card.id === editingWordId ? previous : card));
                    setSyncStatus(error instanceof Error ? error.message : "Word could not be updated.");
                }
            } else {
                setSyncStatus("Saved locally");
            }
            return;
        }
        let wordId = makeId();
        let createdAt = now;

        try {
            if (cloud) {
                setSyncStatus("Saving word...");
                const created = await insertWord(cloud.client, cloud.userId, cloud.workspaceId, {
                    word: form.word.trim(),
                    meaning: form.meaning.trim(),
                    exampleSentence: form.exampleSentence.trim() || undefined,
                    folderId: form.folderId,
                    sourceLanguage: form.sourceLanguage,
                    targetLanguage: form.targetLanguage,
                    cefrLevel: form.cefrLevel || undefined,
                    notes: form.notes.trim() || undefined,
                });
                wordId = created.id;
                createdAt = created.createdAt;
            }

            const newCard: WordRecord = {
                id: wordId, word: form.word.trim(), meaning: form.meaning.trim(), exampleSentence: form.exampleSentence.trim() || undefined,
                folderId: form.folderId, sourceLanguage: form.sourceLanguage, targetLanguage: form.targetLanguage, cefrLevel: form.cefrLevel || undefined, notes: form.notes.trim() || undefined,
                createdAt, state: "new", stability: .25, difficulty: 5, dueAt: now, reps: 0, lapses: 0,
            };
            setCards((previous) => [newCard, ...previous]);
            setActiveView("words");
            setSyncStatus(cloud ? "Synced" : "Saved locally");
        } catch (error) {
            setSyncStatus(error instanceof Error ? error.message : "Word could not be saved.");
        }
    }

    async function addFolder() {
        setEditingFolderId(null);
        setFolderForm({ name: "", description: "", color: "#dcebe1" });
        setReturnView(activeView === "add-folder" ? returnView : activeView);
        setActiveView("add-folder");
    }

    function openEditFolder(folder: Folder) {
        setEditingFolderId(folder.id);
        setFolderForm({ name: folder.name, description: folder.description, color: folder.color });
        setReturnView(activeView === "add-folder" ? returnView : activeView);
        setActiveView("add-folder");
    }

    async function saveFolder(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!folderForm.name.trim()) return;
        const input = { name: folderForm.name.trim(), description: folderForm.description.trim(), color: folderForm.color };
        const cloud = getCloudContext();

        try {
            if (editingFolderId) {
                const previous = folders.find((folder) => folder.id === editingFolderId);
                if (!previous) return;
                setFolders((items) => items.map((folder) => folder.id === editingFolderId ? { ...folder, ...input } : folder));
                if (cloud) {
                    try {
                        await updateFolder(cloud.client, cloud.userId, cloud.workspaceId, editingFolderId, input);
                    } catch (error) {
                        setFolders((items) => items.map((folder) => folder.id === editingFolderId ? previous : folder));
                        throw error;
                    }
                }
            } else {
                const folder = cloud ? await insertFolder(cloud.client, cloud.userId, cloud.workspaceId, input) : { ...input, id: makeId() };
                setFolders((previous) => [...previous, folder]);
            }
            setActiveView(returnView);
            setSyncStatus(cloud ? "Synced" : "Saved locally");
        } catch (error) {
            setSyncStatus(error instanceof Error ? error.message : "Folder could not be saved.");
        }
    }

    async function removeWord(card: WordRecord) {
        if (!window.confirm(`Delete "${card.word}"?`)) return;
        const cloud = getCloudContext();
        setCards((items) => items.filter((item) => item.id !== card.id));
        if (cloud) {
            try {
                await deleteWord(cloud.client, cloud.userId, cloud.workspaceId, card.id);
                setSyncStatus("Synced");
            } catch (error) {
                setCards((items) => [card, ...items]);
                setSyncStatus(error instanceof Error ? error.message : "Word could not be deleted.");
            }
        }
    }

    async function removeFolder(folder: Folder) {
        if (!window.confirm(`Delete folder "${folder.name}"? Words will stay in your library.`)) return;
        const cloud = getCloudContext();
        const affectedCards = cards.filter((card) => card.folderId === folder.id);
        setFolders((items) => items.filter((item) => item.id !== folder.id));
        setCards((items) => items.map((card) => card.folderId === folder.id ? { ...card, folderId: "" } : card));
        if (cloud) {
            try {
                await deleteFolder(cloud.client, cloud.userId, cloud.workspaceId, folder.id);
                setSyncStatus("Synced");
            } catch (error) {
                setFolders((items) => [...items, folder]);
                setCards((items) => items.map((card) => affectedCards.some((affected) => affected.id === card.id) ? { ...card, folderId: folder.id } : card));
                setSyncStatus(error instanceof Error ? error.message : "Folder could not be deleted.");
            }
        }
    }

    async function signOut() {
        const cloud = getCloudContext();
        if (cloud) await cloud.client.auth.signOut();
        window.location.assign("/auth");
    }

    async function switchWorkspace(nextWorkspace: string) {
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
            setIsFlipped(false);
            setSyncStatus("Synced");
        } catch (error) {
            setSyncStatus(error instanceof Error ? error.message : "Workspace could not be loaded.");
        }
    }

    async function addWorkspace() {
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
            setIsFlipped(false);
            setSyncStatus("Workspace created");
        } catch (error) {
            setSyncStatus(error instanceof Error ? error.message : "Workspace could not be created.");
        }
    }

    async function removeCurrentWorkspace() {
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
            setIsFlipped(false);
            setSyncStatus("Workspace deleted");
        } catch (error) {
            setSyncStatus(error instanceof Error ? error.message : "Workspace could not be deleted.");
        }
    }

    async function generateSentence() {
        if (!form.word.trim()) return;
        setGenerating(true);
        try {
            const response = await fetch("/api/generate-sentence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ word: form.word, sourceLanguage: form.sourceLanguage, targetLanguage: form.targetLanguage }) });
            const data = await response.json() as { meaning?: string; sentence?: string; cefrLevel?: CefrLevel; error?: string };
            if (!response.ok) throw new Error(data.error ?? "Generation failed");
            setForm((previous) => ({ ...previous, meaning: data.meaning ?? "", exampleSentence: data.sentence ?? "", cefrLevel: data.cefrLevel ?? "" }));
            setGenerationStatus("AI content ready to edit.");
        } catch (error) {
            setGenerationStatus(error instanceof Error ? error.message : "Could not generate word information.");
        } finally {
            setGenerating(false);
        }
    }

    async function generateQuiz() {
        if (!quizCards.length) {
            setQuizStatus("Add a few words before starting a quiz.");
            return;
        }
        setQuizGenerating(true);
        setQuizStatus("");
        setQuizQuestions([]);
        setQuizIndex(0);
        setQuizAnswer("");
        setQuizSubmitted(false);
        try {
            const selectedCards = [...quizCards];
            if (quizSource === "random") {
                for (let index = selectedCards.length - 1; index > 0; index -= 1) {
                    const randomIndex = Math.floor(Math.random() * (index + 1));
                    [selectedCards[index], selectedCards[randomIndex]] = [selectedCards[randomIndex], selectedCards[index]];
                }
            }
            const quizPool = selectedCards.slice(0, quizCount);
            const response = await fetch("/api/generate-quiz", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ questionCount: quizCount, variation: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, cards: quizPool.map((card) => ({ word: card.word, meaning: card.meaning, exampleSentence: card.exampleSentence, sourceLanguage: card.sourceLanguage, targetLanguage: card.targetLanguage, cefrLevel: card.cefrLevel })) }),
            });
            const data = await response.json() as { questions?: QuizQuestion[]; error?: string };
            if (!response.ok || !data.questions?.length) throw new Error(data.error ?? "Quiz generation failed");
            setQuizQuestions(data.questions);
        } catch (error) {
            setQuizStatus(error instanceof Error ? error.message : "Could not generate a quiz.");
        } finally {
            setQuizGenerating(false);
        }
    }

    function submitQuizAnswer() {
        if (!currentQuizQuestion) return;
        setQuizSubmitted(true);
    }

    function nextQuizQuestion() {
        setQuizIndex((index) => index + 1);
        setQuizAnswer("");
        setQuizSubmitted(false);
    }

    function renderQuiz() {
        const isFinished = quizQuestions.length > 0 && quizIndex >= quizQuestions.length;
        const isCorrect = currentQuizQuestion ? normalizeQuizAnswer(quizAnswer) === normalizeQuizAnswer(currentQuizQuestion.answer) : false;
        return <section className="quiz-page">
            <button className="ghost-button quiz-back-button" onClick={() => setShowQuiz(false)}><ArrowLeft size={14} /> Back to review</button>
            <div className="quiz-intro surface-panel"><div><div className="eyebrow">Personal practice</div><h2>Learn by retrieval</h2><p>Questions are built from your vocabulary and reshuffled for each new quiz.</p></div><div className="quiz-settings"><label>Questions<input type="number" min="1" max="50" step="1" value={quizCount} onChange={(event) => setQuizCount(Math.min(50, Math.max(1, Number(event.target.value) || 1)))} /></label><label>Words<select value={quizSource} onChange={(event) => setQuizSource(event.target.value as "recent" | "random")}><option value="recent">Recent</option><option value="random">Random</option></select></label><button className="primary-button" onClick={() => void generateQuiz()} disabled={quizGenerating || !quizCards.length}><Sparkles size={15} />{quizGenerating ? "Generating..." : quizQuestions.length ? "New quiz" : "Generate quiz"}</button></div></div>
            {quizStatus && <div className="form-note">{quizStatus}</div>}
            {!quizQuestions.length && !quizStatus && <div className="quiz-empty surface-panel"><ListChecks size={30} /><h2>Your next {quizCount} questions</h2><p>Generate a mix of multiple-choice and fill-in-the-blank questions from your vocabulary.</p></div>}
            {isFinished && <div className="quiz-empty surface-panel"><Check size={30} /><h2>Quiz complete</h2><p>You finished {quizQuestions.length} questions. A fresh set will use your current review queue.</p><button className="ghost-button" onClick={() => void generateQuiz()}>Try another set</button></div>}
            {currentQuizQuestion && !isFinished && <div className="quiz-question surface-panel"><div className="quiz-question-head"><span>Question {quizIndex + 1} of {quizQuestions.length}</span><span>{currentQuizQuestion.type === "multiple-choice" ? "Multiple choice" : "Fill in the blank"}</span></div><div className="quiz-progress"><span style={{ width: `${((quizIndex + 1) / quizQuestions.length) * 100}%` }} /></div><h2>{currentQuizQuestion.prompt}</h2><div className="quiz-options">{currentQuizQuestion.options?.map((option) => <button className={`quiz-option ${!quizSubmitted && option === quizAnswer ? "selected" : ""} ${quizSubmitted && option === currentQuizQuestion.answer ? "correct" : ""} ${quizSubmitted && option === quizAnswer && option !== currentQuizQuestion.answer ? "incorrect" : ""}`} key={option} onClick={() => { if (!quizSubmitted) setQuizAnswer(option); }} disabled={quizSubmitted}>{option}</button>)}</div>{quizSubmitted && <div className={`quiz-feedback ${isCorrect ? "correct" : "incorrect"}`}><strong>{isCorrect ? "Correct" : `Correct answer: ${currentQuizQuestion.answer}`}</strong><span>{currentQuizQuestion.explanation || (quizAnswer.trim() ? "Keep practicing this word." : "The answer is shown above. Try to remember it for next time.")}</span></div>}<div className="quiz-actions">{!quizSubmitted ? <button className="primary-button" onClick={submitQuizAnswer}>Check answer</button> : <button className="primary-button" onClick={nextQuizQuestion}>{quizIndex + 1 === quizQuestions.length ? "Finish" : "Next question"}<ArrowRight size={15} /></button>}</div></div>}
        </section>;
    }

    function renderReview() {
        if (showQuiz) return renderQuiz();
        return (
            <div className="dashboard-grid">
                <section className="review-stage" aria-label="Review session">
                    <div className="stage-head">
                        <span className="eyebrow" style={{ color: "#aec2ba" }}>{new Date(now).toLocaleDateString("en-US", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</span><button className="ghost-button quiz-launch-button" onClick={() => setShowQuiz(true)} disabled={!quizCards.length}><ListChecks size={14} /> Quiz</button>
                        <div className="review-controls">
                            <label htmlFor="review-filter">Review set</label>
                            <select id="review-filter" value={selectedReviewFilter?.value ?? "all"} onChange={(event) => { setReviewFilter(event.target.value); setIsFlipped(false); }}>
                                <option value="all">All</option>
                                {reviewFilterOptions.some((option) => option.sourceLanguage) && <optgroup label="Source language">{reviewFilterOptions.filter((option) => option.sourceLanguage).map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</optgroup>}
                                {reviewFilterOptions.some((option) => option.folderId) && <optgroup label="Folder">{reviewFilterOptions.filter((option) => option.folderId).map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</optgroup>}
                            </select>
                        </div>
                        <div className="stage-progress"><span>{dueCount} cards remaining</span><div className="progress-track"><div className="progress-fill" style={{ width: `${Math.max(7, Math.min(100, ((reviewCards.length - dueCount) / Math.max(reviewCards.length, 1)) * 100))}%` }} /></div></div>
                    </div>
                    {currentCard ? <>
                        <div className="flashcard-wrap" onTouchStart={(event) => { const touch = event.changedTouches[0]; touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null; }} onTouchEnd={(event) => { const touch = event.changedTouches[0]; const start = touchStart.current; touchStart.current = null; if (!start || !touch || !isFlipped) return; const deltaX = touch.clientX - start.x; const deltaY = touch.clientY - start.y; if (Math.abs(deltaX) > 65 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) handleReview(deltaX > 0 ? "good" : "forgot"); }} onTouchCancel={() => { touchStart.current = null; }}>
                            <div className={`flashcard ${isFlipped ? "flipped" : ""}`} onClick={() => setIsFlipped((value) => !value)} role="button" tabIndex={0} aria-label={isFlipped ? "Hide answer" : "Reveal answer"} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setIsFlipped((value) => !value); }}>
                                <div className="card-face card-front"><div className="card-topline"><span>{currentCard.sourceLanguage}</span><span>{currentCard.cefrLevel ? `${currentCard.cefrLevel} · ` : ""}{currentCard.state}</span></div><div className="card-word-row"><div className={`card-word ${currentCard.word.length > 16 ? "card-word-long" : ""}`}>{currentCard.word}</div><button type="button" className="speaker-button" aria-label={`Pronounce ${currentCard.word}`} onClick={(event) => { event.stopPropagation(); speakWord(currentCard.word, currentCard.sourceLanguage); }}><Volume2 size={19} /></button></div>{currentCard.exampleSentence && <div className="card-example"><span>Example</span>{currentCard.exampleSentence}</div>}<div className="card-hint"><Eye size={14} /> Tap to reveal</div></div>
                                <div className="card-face card-back"><div className="card-topline"><span>{currentCard.sourceLanguage} → {currentCard.targetLanguage}</span><span>{currentCard.cefrLevel ? `${currentCard.cefrLevel} · ` : ""}{formatDueIn(currentCard.dueAt, new Date(now))}</span></div><div className="card-word-row card-word-row-answer"><div className={`card-word card-word-answer ${currentCard.word.length > 16 ? "card-word-long" : ""}`}>{currentCard.word}</div><button type="button" className="speaker-button" aria-label={`Pronounce ${currentCard.word}`} onClick={(event) => { event.stopPropagation(); speakWord(currentCard.word, currentCard.sourceLanguage); }}><Volume2 size={19} /></button></div><div className="card-meaning">{currentCard.meaning || "Add a meaning after this review."}</div>{currentCard.exampleSentence && <div className="card-example"><span>Example</span>{currentCard.exampleSentence}</div>}</div>
                            </div>
                        </div>
                        <div className="stage-actions review-rating-actions"><button className="review-action forgot" disabled={!isFlipped} onClick={() => handleReview("forgot")}><ArrowLeft size={15} /> Forgot</button><button className="review-action hard" disabled={!isFlipped} onClick={() => handleReview("hard")}><Clock3 size={15} /> Hard</button><button className="review-action good" disabled={!isFlipped} onClick={() => handleReview("good")}><Check size={15} /> Good</button><button className="review-action easy" disabled={!isFlipped} onClick={() => handleReview("easy")}><Sparkles size={15} /> Easy</button></div>
                        <div className="stage-footnote"><Keyboard size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} /> Space to reveal · 1 Forgot · 2 Hard · 3 Good · 4 Easy</div>
                    </> : <div className="empty-stage"><div><Check size={34} /><h2>All clear for now.</h2><p>Your next cards will appear here when they are due. A quiet win.</p><button className="primary-button" style={{ marginTop: 22 }} onClick={() => setActiveView("words")}>Browse words <ArrowRight size={14} /></button></div></div>}
                </section>
                <div className="side-stack"><section className="surface-panel"><div className="panel-heading"><h2>Today</h2><button onClick={() => setActiveView("statistics")}>See stats</button></div><div className="stat-row"><span className="stat-label"><span className="dot-icon dot-sage" />Reviews</span><strong className="stat-value">{todayLogs.length}</strong></div><div className="stat-row"><span className="stat-label"><span className="dot-icon dot-peach" />Due now</span><strong className="stat-value">{dueCount}</strong></div><div className="stat-row"><span className="stat-label"><span className="dot-icon dot-yellow" />Learned</span><strong className="stat-value">{learnedCount}</strong></div></section><section className="surface-panel streak-panel"><div className="streak-icon"><Flame size={21} /></div><div><strong>{calculateStreak(logs)} days</strong><span>Current learning streak</span></div></section><section className="surface-panel"><div className="panel-heading"><h2>Review rhythm</h2><Clock3 size={16} color="var(--muted)" /></div><p style={{ margin: 0, color: "var(--muted)", fontSize: 12, lineHeight: 1.6 }}>Two short sessions a day beat one heroic session a week. Your next card is waiting.</p></section></div>
            </div>
        );
    }

    function renderWordDetail() {
        const card = cards.find((item) => item.id === selectedWordId);
        if (!card) {
            return <section className="surface-panel"><p className="stats-empty">This word is no longer available.</p><button className="ghost-button" onClick={() => { setSelectedWordId(null); setActiveView(detailReturnView); }}>Back</button></section>;
        }
        const wordLogs = logs.filter((log) => log.wordId === card.id).sort((first, second) => new Date(second.reviewedAt).getTime() - new Date(first.reviewedAt).getTime());
        const successfulReviews = wordLogs.filter((log) => log.rating !== "forgot").length;
        const successRate = wordLogs.length ? Math.round((successfulReviews / wordLogs.length) * 100) : 0;
        const folderName = folders.find((folder) => sameId(folder.id, card.folderId))?.name ?? "Unsorted";
        const ratingLabels: Record<ReviewRating, string> = { forgot: "Forgot", hard: "Hard", good: "Good", easy: "Easy" };
        return <section className="word-detail-page"><button className="ghost-button" onClick={() => { setSelectedWordId(null); setActiveView(detailReturnView); }}><ArrowLeft size={14} /> Back</button><div className="word-detail-hero surface-panel"><div><div className="eyebrow">{card.sourceLanguage} · {folderName}</div><h2>{card.word}</h2><p>{card.meaning || "Meaning to be added"}</p></div><button type="button" className="speaker-button detail-speaker" onClick={() => speakWord(card.word, card.sourceLanguage)} aria-label={`Pronounce ${card.word}`}><Volume2 size={19} /></button></div><div className="word-detail-grid"><section className="surface-panel"><div className="panel-heading"><h2>Progress</h2><BarChart3 size={17} color="var(--sage)" /></div><div className="detail-stat-list"><div><span>Success rate</span><strong>{wordLogs.length ? `${successRate}%` : "No reviews yet"}</strong></div><div><span>Reviews</span><strong>{wordLogs.length}</strong></div><div><span>Next review</span><strong>{formatDueIn(card.dueAt, new Date(now))}</strong></div><div><span>Current state</span><strong>{card.state}</strong></div></div></section><section className="surface-panel"><div className="panel-heading"><h2>Context</h2><Pencil size={16} color="var(--sage)" /></div><div className="detail-copy"><div><span className="mono-label">Example sentence</span><p>{card.exampleSentence || "No example sentence yet."}</p></div><div><span className="mono-label">Notes</span><p>{card.notes || "No notes yet."}</p></div></div></section></div><section className="surface-panel"><div className="panel-heading"><div><h2>Review history</h2><p className="panel-subtitle">Your recent attempts with this word</p></div><button className="ghost-button detail-edit-button" onClick={() => openEditWord(card)}><Pencil size={14} /> Edit word</button></div>{wordLogs.length ? <div className="review-history">{wordLogs.map((log) => <div className="review-history-row" key={log.id}><span>{new Date(log.reviewedAt).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}</span><strong className={`history-rating ${log.rating}`}>{ratingLabels[log.rating]}</strong></div>)}</div> : <p className="stats-empty">Review this word to start building its history.</p>}</section></section>;
    }

    function renderWords() {
        if (selectedWordId) return renderWordDetail();
        return <><div className="view-toolbar"><div className="search-box"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search vocabulary..." /></div><div className="filter-row">{(["all", "new", "learning", "review", "mastered"] as Filter[]).map((item) => <button className={`filter-chip ${filter === item ? "active" : ""}`} key={item} onClick={() => setFilter(item)}>{item === "all" ? "All" : item[0].toUpperCase() + item.slice(1)}</button>)}</div></div><div className="word-list">{visibleCards.length ? visibleCards.map((card) => <div className="word-row" key={card.id}><div className="word-main"><button type="button" className="word-title word-title-button" onClick={() => openWordDetail(card)}><strong>{card.word}</strong></button><span>{card.meaning || "Meaning to be added"}</span></div><div className="word-folder">{folders.find((folder) => folder.id === card.folderId)?.name ?? "Unsorted"}</div><div><span className={`state-tag state-${card.state}`}>{card.state}</span></div><div className="word-due">{formatDueIn(card.dueAt, new Date(now))}</div><div className="row-actions"><button type="button" className="speaker-button word-speaker" onClick={(event) => { event.stopPropagation(); speakWord(card.word, card.sourceLanguage); }} aria-label={`Pronounce ${card.word}`}><Volume2 size={15} /></button><button className="icon-button" onClick={() => openEditWord(card)} aria-label={`Edit ${card.word}`}><Pencil size={14} /></button><button className="icon-button danger-button" onClick={() => void removeWord(card)} aria-label={`Delete ${card.word}`}><Trash2 size={14} /></button></div></div>) : <div className="no-results">No words match that search.</div>}</div></>;
    }

    function renderFolders() {
        const selectedFolder = folders.find((folder) => folder.id === selectedFolderId);
        if (selectedFolder) {
            const selectedCards = getFolderCards(selectedFolder.id);
            return <section className="folder-detail"><button className="ghost-button" onClick={() => setSelectedFolderId(null)}><ArrowLeft size={14} /> All folders</button><div className="folder-detail-header"><div className="folder-color" style={{ background: selectedFolder.color }} /><div><div className="eyebrow">Folder</div><h2>{selectedFolder.name}</h2><p>{selectedFolder.description}</p></div></div><div className="folder-detail-list">{selectedCards.length ? selectedCards.map((card) => <div className="word-row" key={card.id}><div className="word-main"><button type="button" className="word-title word-title-button" onClick={() => openWordDetail(card)}><strong>{card.word}</strong></button><span>{card.meaning || "Meaning to be added"}</span></div><span className={`state-tag state-${card.state}`}>{card.state}</span><div className="row-actions"><button type="button" className="speaker-button word-speaker" onClick={(event) => { event.stopPropagation(); speakWord(card.word, card.sourceLanguage); }} aria-label={`Pronounce ${card.word}`}><Volume2 size={15} /></button><button className="icon-button" onClick={() => openEditWord(card)} aria-label={`Edit ${card.word}`}><Pencil size={14} /></button><button className="icon-button danger-button" onClick={() => void removeWord(card)} aria-label={`Delete ${card.word}`}><Trash2 size={14} /></button></div></div>) : <div className="no-results">No words in this folder yet.</div>}</div></section>;
        }
        return <div className="folder-grid">{folders.map((folder) => { const folderCards = getFolderCards(folder.id); const due = folderCards.filter((card) => new Date(card.dueAt).getTime() <= now).length; return <div className="folder-card" key={folder.id} onClick={(event) => { if ((event.target as HTMLElement).closest("button")) return; setSelectedFolderId(folder.id); }}><div className="folder-card-top"><div className="folder-color" style={{ background: folder.color }} /><div className="row-actions"><button className="icon-button" onClick={() => openEditFolder(folder)} aria-label={`Edit ${folder.name}`}><Pencil size={14} /></button><button className="icon-button danger-button" onClick={() => void removeFolder(folder)} aria-label={`Delete ${folder.name}`}><Trash2 size={14} /></button></div></div><h3>{folder.name}</h3><p>{folder.description}</p><div className="folder-meta"><span>{folderCards.length} {folderCards.length === 1 ? "word" : "words"}</span><span>{due} due</span></div></div> })}<button className="folder-card" onClick={addFolder} style={{ borderStyle: "dashed", alignItems: "center", justifyContent: "center", color: "var(--sage)" }}><CirclePlus size={22} /><span style={{ marginTop: 10, fontSize: 12, fontWeight: 700 }}>New folder</span></button></div>;
    }

    function renderAddFolder() {
        return <div className="modal add-word-page" role="region" aria-labelledby="folder-title"><div className="modal-header"><div><div className="eyebrow">Collection</div><h2 id="folder-title">{editingFolderId ? "Edit folder" : "New folder"}</h2><p>Keep a small set of related words together.</p></div><button className="icon-button" onClick={() => setActiveView(returnView)} aria-label="Close"><X size={17} /></button></div><form className="form-grid" onSubmit={saveFolder}><div className="field"><label htmlFor="folder-name">Name</label><input id="folder-name" required value={folderForm.name} onChange={(event) => setFolderForm((previous) => ({ ...previous, name: event.target.value }))} placeholder="e.g. German B2" /></div><div className="field"><label htmlFor="folder-description">Description</label><textarea id="folder-description" value={folderForm.description} onChange={(event) => setFolderForm((previous) => ({ ...previous, description: event.target.value }))} placeholder="A short note about this collection" /></div><div className="field"><label htmlFor="folder-color">Color</label><input id="folder-color" type="color" value={folderForm.color} onChange={(event) => setFolderForm((previous) => ({ ...previous, color: event.target.value }))} /></div><div className="modal-footer"><button type="button" className="ghost-button" onClick={() => setActiveView(returnView)}>Cancel</button><button className="primary-button" type="submit"><Check size={15} /> Save folder</button></div></form></div>;
    }

    function renderStatistics() {
        const weekStart = new Date();
        weekStart.setHours(0, 0, 0, 0);
        weekStart.setDate(weekStart.getDate() - 6);
        const weeklyLogs = logs.filter((log) => new Date(log.reviewedAt).getTime() >= weekStart.getTime());
        const knownReviews = logs.filter((log) => log.rating !== "forgot").length;
        const accuracy = logs.length ? Math.round((knownReviews / logs.length) * 100) : 0;
        const cardById = new Map(cards.map((card) => [card.id, card]));
        const statsForCards = (groupCards: WordRecord[]) => {
            const groupIds = new Set(groupCards.map((card) => card.id));
            const groupLogs = logs.filter((log) => groupIds.has(log.wordId));
            const remembered = groupLogs.filter((log) => log.rating !== "forgot").length;
            return {
                reviewed: groupLogs.length,
                accuracy: groupLogs.length ? Math.round((remembered / groupLogs.length) * 100) : 0,
                mastered: groupCards.filter((card) => card.state === "mastered").length,
                due: groupCards.filter((card) => new Date(card.dueAt).getTime() <= now).length,
            };
        };
        const languageStats = Array.from(new Set(cards.map((card) => card.sourceLanguage).filter(Boolean)))
            .sort()
            .map((label) => ({ label, ...statsForCards(cards.filter((card) => card.sourceLanguage === label)) }));
        const folderGroups = new Map<string, WordRecord[]>();
        folders.forEach((folder) => folderGroups.set(folder.id, []));
        cards.forEach((card) => {
            const groupId = card.folderId || "unsorted";
            folderGroups.set(groupId, [...(folderGroups.get(groupId) ?? []), card]);
        });
        const folderStats = Array.from(folderGroups.entries())
            .map(([groupId, groupCards]) => ({
                label: groupId === "unsorted" ? "Unsorted" : folders.find((folder) => folder.id === groupId)?.name ?? "Unsorted",
                ...statsForCards(groupCards),
            }))
            .sort((first, second) => first.label.localeCompare(second.label));
        const forgottenCounts = new Map<string, number>();
        logs.filter((log) => log.rating === "forgot").forEach((log) => forgottenCounts.set(log.wordId, (forgottenCounts.get(log.wordId) ?? 0) + 1));
        const forgottenWords = Array.from(forgottenCounts.entries())
            .flatMap(([wordId, count]) => {
                const card = cardById.get(wordId);
                return card ? [{ card, count }] : [];
            })
            .sort((first, second) => second.count - first.count)
            .slice(0, 6);
        const reviewedCardIds = new Set(logs.map((log) => log.wordId));
        const retainedCards = cards.filter((card) => reviewedCardIds.has(card.id) && card.lapses === 0);
        const retentionRate = reviewedCardIds.size ? Math.round((retainedCards.length / reviewedCardIds.size) * 100) : 0;
        const recentStart = new Date(now);
        recentStart.setDate(recentStart.getDate() - 29);
        const recentKnownLogs = logs.filter((log) => log.rating !== "forgot" && new Date(log.reviewedAt).getTime() >= recentStart.getTime());
        const activeRecentDays = new Set(recentKnownLogs.map((log) => new Date(log.reviewedAt).toDateString())).size;
        const successfulReviewsPerDay = recentKnownLogs.length / Math.max(activeRecentDays, 1);
        const unfinishedCount = cards.filter((card) => card.state !== "mastered").length;
        const estimatedMasteryDays = unfinishedCount && recentKnownLogs.length
            ? Math.ceil(unfinishedCount / Math.max(successfulReviewsPerDay, 0.25))
            : 0;
        const estimatedMastery = unfinishedCount === 0
            ? "Complete"
            : estimatedMasteryDays
                ? new Date(now + estimatedMasteryDays * 86_400_000).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                : "Not enough data";
        const dayBuckets = Array.from({ length: 7 }, (_, index) => {
            const date = new Date(weekStart);
            date.setDate(weekStart.getDate() + index);
            return { date, count: weeklyLogs.filter((log) => new Date(log.reviewedAt).toDateString() === date.toDateString()).length };
        });
        const maxReviews = Math.max(...dayBuckets.map((day) => day.count), 1);
        const stats = [
            { label: "Total words", value: cards.length, detail: "Words in your library" },
            { label: "Learned", value: `${Math.round((learnedCount / Math.max(cards.length, 1)) * 100)}%`, detail: `${learnedCount} mastered cards` },
            { label: "Reviews this week", value: weeklyLogs.length, detail: "Cards practiced in the last 7 days" },
            { label: "Accuracy", value: `${accuracy}%`, detail: `${knownReviews} remembered · ${logs.length - knownReviews} forgotten` },
            { label: "Retention rate", value: `${retentionRate}%`, detail: `${retainedCards.length} cards without a recorded lapse` },
            { label: "Estimated mastery", value: estimatedMastery, detail: unfinishedCount ? `${unfinishedCount} cards still in progress` : "Every card is mastered", compact: true },
        ];
        const renderPerformanceRows = (rows: typeof languageStats) => rows.length ? <div className="stats-table">{rows.map((row) => <div className="performance-row" key={row.label}><div><strong>{row.label}</strong><span>{row.reviewed} reviews · {row.mastered} mastered · {row.due} due</span></div><strong>{row.reviewed ? `${row.accuracy}%` : "—"}</strong></div>)}</div> : <p className="stats-empty">Add and review a few cards to see this breakdown.</p>;
        return <><div className="stats-grid">{stats.map((stat) => <div className="big-stat" key={stat.label}><small>{stat.label}</small><strong className={stat.compact ? "compact-stat" : undefined}>{stat.value}</strong><span className="stat-detail">{stat.detail}</span></div>)}</div><div className="stats-detail-grid"><section className="surface-panel"><div className="panel-heading"><div><h2>Reviews this week</h2><p className="panel-subtitle">Your practice by day</p></div><span className="mono-label">Last 7 days</span></div><div className="bar-chart">{dayBuckets.map((day, index) => <div className="bar-column" key={day.date.toISOString()}><div className={`bar ${index === 6 ? "today" : ""}`} style={{ height: `${Math.max(day.count ? 12 : 3, (day.count / maxReviews) * 100)}%` }} /><span>{day.date.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 1)}</span></div>)}</div></section><section className="surface-panel stats-explanation"><div className="panel-heading"><div><h2>What this means</h2><p className="panel-subtitle">A quick read of your progress</p></div><BarChart3 size={17} color="var(--sage)" /></div><div className="stat-row"><span className="stat-label"><span className="dot-icon dot-sage" />Due now</span><strong className="stat-value">{dueCount}</strong></div><div className="stat-row"><span className="stat-label"><span className="dot-icon dot-peach" />Current streak</span><strong className="stat-value">{calculateStreak(logs)} days</strong></div><p className="stats-note">Retention counts cards you have reviewed without a recorded lapse. Mastery is estimated from your recent successful-review pace.</p></section></div><div className="stats-breakdown-grid"><section className="surface-panel"><div className="panel-heading"><div><h2>By language</h2><p className="panel-subtitle">Accuracy by source language</p></div><Languages size={17} color="var(--sage)" /></div>{renderPerformanceRows(languageStats)}</section><section className="surface-panel"><div className="panel-heading"><div><h2>By folder</h2><p className="panel-subtitle">Accuracy by collection</p></div><FolderOpen size={17} color="var(--sage)" /></div>{renderPerformanceRows(folderStats)}</section><section className="surface-panel"><div className="panel-heading"><div><h2>Most forgotten</h2><p className="panel-subtitle">Words that need another pass</p></div><ArrowLeft size={17} color="var(--red)" /></div>{forgottenWords.length ? <div className="stats-table">{forgottenWords.map(({ card, count }) => <div className="performance-row" key={card.id}><div><strong>{card.word}</strong><span>{card.meaning || "Meaning to be added"}</span></div><strong>{count}x</strong></div>)}</div> : <p className="stats-empty">No forgotten reviews yet. Keep going.</p>}</section></div></>;
    }

    function renderAddWord() {
        return (
            <div className="modal add-word-page" role="region" aria-labelledby="add-word-title">
                <div className="modal-header">
                    <div><div className="eyebrow">New vocabulary</div><h2 id="add-word-title">{editingWordId ? "Edit word" : "Add a word"}</h2><p>Give it just enough context to stick.</p></div>
                    <button className="icon-button" onClick={() => setActiveView(returnView)} aria-label="Close"><X size={17} /></button>
                </div>
                <form className="form-grid" onSubmit={addWord}>
                    <div className="language-row">
                        <div className="field"><label htmlFor="source-language">Source language</label><select id="source-language" value={form.sourceLanguage} onChange={(event) => setForm((previous) => ({ ...previous, sourceLanguage: event.target.value }))}>{languageOptions.map((language) => <option value={language} key={language}>{language}</option>)}</select></div>
                        <div className="field"><label htmlFor="target-language">Target language</label><select id="target-language" value={form.targetLanguage} onChange={(event) => setForm((previous) => ({ ...previous, targetLanguage: event.target.value }))}>{languageOptions.map((language) => <option value={language} key={language}>{language}</option>)}</select></div>
                    </div>
                    <div className="field"><label htmlFor="word">Word or phrase</label><div className="input-with-action"><input id="word" required value={form.word} onChange={(event) => setForm((previous) => ({ ...previous, word: event.target.value }))} placeholder="e.g. der Kies" /><button type="button" className="input-action" onClick={generateSentence} disabled={generating || !form.word.trim()}><Sparkles size={13} />{generating ? "Generating..." : "Generate"}</button></div></div>
                    <div className="field"><label htmlFor="meaning">Meaning in target language</label><textarea id="meaning" value={form.meaning} onChange={(event) => setForm((previous) => ({ ...previous, meaning: event.target.value }))} placeholder="Generated translation" /></div>
                    <div className="field"><label htmlFor="example">Example sentence</label><textarea id="example" value={form.exampleSentence} onChange={(event) => setForm((previous) => ({ ...previous, exampleSentence: event.target.value }))} placeholder="Generated example sentence" /></div>
                    <div className="field"><label htmlFor="cefr-level">Estimated CEFR level</label><select id="cefr-level" value={form.cefrLevel} onChange={(event) => setForm((previous) => ({ ...previous, cefrLevel: event.target.value as CefrLevel | "" }))}><option value="">Not set</option>{cefrLevels.map((level) => <option value={level} key={level}>{level}</option>)}</select></div>
                    {generationStatus && <div className="form-note">{generationStatus}</div>}
                    <div className="field"><label htmlFor="folder">Folder</label><select id="folder" value={form.folderId} onChange={(event) => setForm((previous) => ({ ...previous, folderId: event.target.value }))}>{folders.map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}</select></div>
                    <div className="field"><label htmlFor="notes">Notes <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span></label><textarea id="notes" value={form.notes} onChange={(event) => setForm((previous) => ({ ...previous, notes: event.target.value }))} placeholder="A small memory hook..." /></div>
                    <div className="modal-footer"><button type="button" className="ghost-button" onClick={() => setActiveView(returnView)}>Cancel</button><button className="primary-button" type="submit"><Check size={15} /> Save word</button></div>
                </form>
            </div>
        );
    }

    function renderSettings() {
        return <section className="surface-panel"><div className="panel-heading"><h2>Learning setup</h2><ShieldCheck size={17} color="var(--sage)" /></div><div className="settings-list"><div className="setting-row"><div className="setting-copy"><strong>Workspace</strong><span>Switch your learning shelf.</span></div><div className="setting-control"><select value={workspace} onChange={(event) => void switchWorkspace(event.target.value)}>{(cloudMode ? workspaces.map((item) => item.name) : ["Arda's notebook", "Travel words", "Reading shelf"]).map((item) => <option key={item}>{item}</option>)}</select><button className="icon-button" onClick={() => void addWorkspace()} aria-label="Create workspace"><CirclePlus size={15} /></button></div></div><div className="setting-row"><div className="setting-copy"><strong>New cards per day</strong><span>Keep the first step light.</span></div><select defaultValue="20"><option>10</option><option>20</option><option>30</option></select></div><div className="setting-row"><div className="setting-copy"><strong>Dark mode</strong><span>Use a lower-light palette.</span></div><button className={`toggle ${darkMode ? "on" : ""}`} onClick={() => setDarkMode((value) => !value)} aria-label="Toggle dark mode"><i /></button></div><div className="setting-row"><div className="setting-copy"><strong>Sync status</strong><span>{syncStatus || (cloudMode ? "Connected to Supabase" : "Local demo mode")}</span></div><span className="state-tag state-review">{cloudMode ? "Cloud" : "Local"}</span></div><div className="setting-row"><div className="setting-copy"><strong>Keyboard shortcuts</strong><span>Reveal with Space, rate with 1-4.</span></div><Keyboard size={18} color="var(--muted)" /></div><div className="setting-row"><div className="setting-copy"><strong>Account</strong><span>Sign out from this workspace.</span></div><button className="ghost-button" onClick={() => void signOut()}><LogOut size={14} /> Sign out</button></div></div></section>;
    }

    return <div className="app-shell"><aside className="sidebar"><div className="brand"><div className="brand-mark"><BookOpenCheck size={17} /></div><span className="brand-name">Lexicon Loop</span></div><div className="workspace-label">Workspace</div><div className="workspace-picker"><span className="workspace-dot" /><span style={{ flex: 1 }}>Arda&apos;s notebook</span><ChevronDown size={14} color="var(--muted)" /></div><nav className="nav-group" aria-label="Main navigation">{navItems.map(({ id, label, icon: Icon }) => <button className={`nav-button ${activeView === id ? "active" : ""}`} key={id} onClick={() => { setActiveView(id); setIsFlipped(false); }}><Icon size={16} />{label}{id === "review" && dueCount > 0 && <span className="nav-count">{dueCount}</span>}</button>)}<button className={`nav-button ${activeView === "settings" ? "active" : ""}`} onClick={() => setActiveView("settings")}><Settings2 size={16} />Settings</button></nav><div className="sidebar-spacer" /><div className="sidebar-profile"><div className="avatar">AK</div><div className="profile-copy"><strong>Arda Kaya</strong><span>Free workspace</span></div><Menu size={16} color="var(--muted)" /></div></aside><div className="main-area"><div className="topbar-mobile"><div className="mobile-brand"><div className="brand-mark"><BookOpenCheck size={15} /></div>Lexicon Loop</div><button className="icon-button" onClick={openAddModal} aria-label="Add word"><CirclePlus size={18} /></button></div><main className="page-wrap">{activeView !== "add" && activeView !== "add-folder" && <header className="page-header"><div><div className="eyebrow">{activeView === "review" ? "Tuesday · 08 September 2026" : "Your library"}</div><h1>{titleForView[activeView]}</h1><p>{subtitleForView[activeView]}</p></div><div className="header-actions"><button className="icon-button" aria-label="Search" onClick={() => setActiveView("words")}><Search size={17} /></button><button className="primary-button" onClick={openAddModal}><CirclePlus size={16} /> Add word</button></div></header>}{activeView === "review" && renderReview()}{activeView === "words" && renderWords()}{activeView === "folders" && renderFolders()}{activeView === "statistics" && renderStatistics()}{activeView === "settings" && renderSettings()}{activeView === "add" && renderAddWord()}{activeView === "add-folder" && renderAddFolder()}</main></div><nav className="mobile-nav" aria-label="Mobile navigation">{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={activeView === id ? "active" : ""} onClick={() => setActiveView(id)}><Icon size={18} /><span>{label}</span></button>)}<button className="add-mobile" onClick={openAddModal}><span><CirclePlus size={17} /></span><small>Add</small></button></nav></div>;
}
