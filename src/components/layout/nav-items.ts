import { BarChart3, BookOpenCheck, FolderOpen, Languages, Sparkles } from "lucide-react";
import type { View } from "@/context/navigation-context";

export const navItems: Array<{ id: View; label: string; icon: typeof BookOpenCheck }> = [
    { id: "review", label: "Review", icon: BookOpenCheck },
    { id: "words", label: "Words", icon: Languages },
    { id: "translate", label: "Translate", icon: Sparkles },
    { id: "folders", label: "Folders", icon: FolderOpen },
    { id: "statistics", label: "Statistics", icon: BarChart3 },
];

export const titleForView: Record<View, string> = {
    review: "Hello there",
    words: "Your vocabulary",
    translate: "Translate a word",
    folders: "Your collections",
    statistics: "A little progress",
    settings: "Your preferences",
    add: "Add a word",
    "add-folder": "New folder",
    "word-detail": "Word details",
};

export const subtitleForView: Record<View, string> = {
    add: "Give it just enough context to stick.",
    "add-folder": "Keep a small set of related words together.",
    review: "A few deliberate minutes is enough for today.",
    words: "Every word has a place in your memory.",
    translate: "Explore a word before it enters your memory.",
    folders: "Keep related words close together.",
    statistics: "Small repetitions become visible over time.",
    settings: "Make the rhythm fit your day.",
    "word-detail": "A closer look at this word.",
};
