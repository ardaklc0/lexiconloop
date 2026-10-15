import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { BookOpenCheck, ChevronDown, CirclePlus, Menu, Search, Settings2 } from "lucide-react";
import { AddFolderScreen } from "@/components/folders/add-folder-screen";
import { FoldersScreen } from "@/components/folders/folders-screen";
import { navItems, subtitleForView, titleForView } from "@/components/layout/nav-items";
import { ReviewScreen } from "@/components/review/review-screen";
import { AddWordScreen } from "@/components/words/add-word-screen";
import { WordsScreen } from "@/components/words/words-screen";
import { useAppData } from "@/context/app-data-context";
import { useNavigation } from "@/context/navigation-context";
import { useReview } from "@/context/review-context";
import { useClock } from "@/hooks/use-clock";
import { useDeviceTheme } from "@/hooks/use-device-theme";

// Less-used screens load on first open instead of with the review screen.
const TranslateScreen = dynamic(() => import("@/components/translate/translate-screen").then((module) => module.TranslateScreen));
const StatisticsScreen = dynamic(() => import("@/components/statistics/statistics-screen").then((module) => module.StatisticsScreen));
const SettingsScreen = dynamic(() => import("@/components/settings/settings-screen").then((module) => module.SettingsScreen));

const formatHeaderDate = (now: number) => new Date(now).toLocaleDateString("en-US", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

export function AppShell() {
    const { workspace, workspaces, switchWorkspace, removeCurrentWorkspace } = useAppData();
    const { activeView, navigate, openAddWord } = useNavigation();
    const { queue, setIsFlipped } = useReview();
    const [darkMode, setDarkMode] = useDeviceTheme();
    const [showMobileMenu, setShowMobileMenu] = useState(false);
    const headerDate = useClock(formatHeaderDate);
    const dueCount = queue.length;

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
    }, [removeCurrentWorkspace, switchWorkspace, workspace, workspaces]);

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
        if (activeView !== "review") return;
        const eyebrow = document.querySelector<HTMLElement>(".page-header .eyebrow");
        if (eyebrow) eyebrow.textContent = headerDate;
    }, [activeView, headerDate]);

    return <div className="app-shell"><aside className="sidebar"><div className="brand"><div className="brand-mark"><BookOpenCheck size={17} /></div><span className="brand-name">Lexicon Loop</span></div><div className="workspace-label">Workspace</div><div className="workspace-picker"><span className="workspace-dot" /><span style={{ flex: 1 }}>Arda&apos;s notebook</span><ChevronDown size={14} color="var(--muted)" /></div><nav className="nav-group" aria-label="Main navigation">{navItems.map(({ id, label, icon: Icon }) => <button className={`nav-button ${activeView === id ? "active" : ""}`} key={id} onClick={() => { navigate(id); setIsFlipped(false); }}><Icon size={16} />{label}{id === "review" && dueCount > 0 && <span className="nav-count">{dueCount}</span>}</button>)}<button className={`nav-button ${activeView === "settings" ? "active" : ""}`} onClick={() => navigate("settings")}><Settings2 size={16} />Settings</button></nav><div className="sidebar-spacer" /><div className="sidebar-profile"><div className="avatar">AK</div><div className="profile-copy"><strong>Arda Kaya</strong><span>Free workspace</span></div><Menu size={16} color="var(--muted)" /></div></aside><div className="main-area"><div className="topbar-mobile"><div className="mobile-brand"><div className="brand-mark"><BookOpenCheck size={15} /></div>Lexicon Loop</div><button className="icon-button" onClick={openAddWord} aria-label="Add word"><CirclePlus size={18} /></button></div><main className="page-wrap">{activeView !== "add" && activeView !== "add-folder" && <header className="page-header"><div><div className="eyebrow">{activeView === "review" ? "Tuesday · 08 September 2026" : "Your library"}</div><h1>{titleForView[activeView]}</h1><p>{subtitleForView[activeView]}</p></div><div className="header-actions"><button className="icon-button" aria-label="Search" onClick={() => navigate("words")}><Search size={17} /></button><button className="primary-button" onClick={openAddWord}><CirclePlus size={16} /> Add word</button></div></header>}{activeView === "review" && <ReviewScreen />}{activeView === "words" && <WordsScreen />}{activeView === "translate" && <TranslateScreen />}{activeView === "folders" && <FoldersScreen />}{activeView === "statistics" && <StatisticsScreen />}{activeView === "settings" && <SettingsScreen darkMode={darkMode} onDarkModeChange={setDarkMode} />}{activeView === "add" && <AddWordScreen />}{activeView === "add-folder" && <AddFolderScreen />}</main></div><nav className="mobile-nav" aria-label="Mobile navigation">{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={activeView === id ? "active" : ""} onClick={() => navigate(id)}><Icon size={18} /><span>{label}</span></button>)}<button className="add-mobile" onClick={openAddWord}><span><CirclePlus size={17} /></span><small>Add</small></button></nav></div>;
}
