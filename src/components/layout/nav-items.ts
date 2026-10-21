import { BarChart3, BookOpenCheck, FolderOpen, Languages, Sparkles } from "lucide-react";
import type { View } from "@/context/navigation-context";

export const navItems: Array<{ id: View; label: string; icon: typeof BookOpenCheck }> = [
    { id: "review", label: "Review", icon: BookOpenCheck },
    { id: "words", label: "Words", icon: Languages },
    { id: "translate", label: "Translate", icon: Sparkles },
    { id: "folders", label: "Folders", icon: FolderOpen },
    { id: "statistics", label: "Statistics", icon: BarChart3 },
];

export const titleForView: Partial<Record<View, string>> = {
    words: "Your vocabulary",
    translate: "Translate a word",
    folders: "Your collections",
    statistics: "A little progress",
    settings: "Your preferences",
    add: "Add a word",
    "add-folder": "New folder",
    "word-detail": "Word details",
};
