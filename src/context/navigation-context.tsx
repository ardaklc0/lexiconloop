import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useAppData } from "@/context/app-data-context";
import { screenState, setScreenState } from "@/hooks/use-screen-state";
import type { CefrLevel, Folder, WordRecord } from "@/lib/types";

export type View = "review" | "words" | "translate" | "folders" | "statistics" | "settings" | "add" | "add-folder" | "word-detail";

export type WordForm = {
    word: string;
    meaning: string;
    exampleSentence: string;
    folderId: string;
    sourceLanguage: string;
    targetLanguage: string;
    cefrLevel: CefrLevel | "";
    notes: string;
};

export type FolderForm = Pick<Folder, "name" | "description" | "color">;

// Screen state that navigation actions prefill before opening a screen.
export const wordFormState = screenState<WordForm>("add-word.form", { word: "", meaning: "", exampleSentence: "", folderId: "", sourceLanguage: "German", targetLanguage: "Turkish", cefrLevel: "", notes: "" });
export const editingWordIdState = screenState<string | null>("add-word.editing-id", null);
export const generationStatusState = screenState("add-word.generation-status", "");
export const folderFormState = screenState<FolderForm>("add-folder.form", { name: "", description: "", color: "#dcebe1" });
export const editingFolderIdState = screenState<string | null>("add-folder.editing-id", null);
export const selectedWordIdState = screenState<string | null>("words.selected-word-id", null);
export const detailReturnViewState = screenState<View>("words.detail-return-view", "words");

type Navigation = {
    activeView: View;
    returnView: View;
    navigate: (view: View) => void;
    openAddWord: () => void;
    openEditWord: (card: WordRecord) => void;
    openWordDetail: (card: WordRecord) => void;
    openAddFolder: () => void;
    openEditFolder: (folder: Folder) => void;
};

const NavigationContext = createContext<Navigation | null>(null);

export function useNavigation() {
    const value = useContext(NavigationContext);
    if (!value) throw new Error("useNavigation must be used inside NavigationProvider.");
    return value;
}

export function NavigationProvider({ children }: { children: ReactNode }) {
    const { folders } = useAppData();
    const [activeView, setActiveView] = useState<View>("review");
    const [returnView, setReturnView] = useState<View>("words");

    const openAddWord = useCallback(() => {
        setScreenState(selectedWordIdState, null);
        setScreenState(editingWordIdState, null);
        setScreenState(wordFormState, (previous): WordForm => ({ word: "", meaning: "", exampleSentence: "", folderId: previous.folderId || folders[0]?.id || "", sourceLanguage: previous.sourceLanguage, targetLanguage: previous.targetLanguage, cefrLevel: "", notes: "" }));
        setScreenState(generationStatusState, "");
        setReturnView((current) => activeView === "add" ? current : activeView);
        setActiveView("add");
    }, [activeView, folders]);

    const openEditWord = useCallback((card: WordRecord) => {
        setScreenState(editingWordIdState, card.id);
        setScreenState(wordFormState, { word: card.word, meaning: card.meaning, exampleSentence: card.exampleSentence ?? "", folderId: card.folderId, sourceLanguage: card.sourceLanguage, targetLanguage: card.targetLanguage, cefrLevel: card.cefrLevel ?? "", notes: card.notes ?? "" });
        setScreenState(generationStatusState, "");
        setReturnView((current) => activeView === "add" ? current : activeView);
        setActiveView("add");
    }, [activeView]);

    const openWordDetail = useCallback((card: WordRecord) => {
        setScreenState(selectedWordIdState, card.id);
        setScreenState(detailReturnViewState, activeView);
        setActiveView("words");
    }, [activeView]);

    const openAddFolder = useCallback(() => {
        setScreenState(editingFolderIdState, null);
        setScreenState(folderFormState, { name: "", description: "", color: "#dcebe1" });
        setReturnView((current) => activeView === "add-folder" ? current : activeView);
        setActiveView("add-folder");
    }, [activeView]);

    const openEditFolder = useCallback((folder: Folder) => {
        setScreenState(editingFolderIdState, folder.id);
        setScreenState(folderFormState, { name: folder.name, description: folder.description, color: folder.color });
        setReturnView((current) => activeView === "add-folder" ? current : activeView);
        setActiveView("add-folder");
    }, [activeView]);

    const value = useMemo<Navigation>(() => ({
        activeView, returnView, navigate: setActiveView, openAddWord, openEditWord, openWordDetail, openAddFolder, openEditFolder,
    }), [activeView, openAddFolder, openAddWord, openEditFolder, openEditWord, openWordDetail, returnView]);

    return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}
