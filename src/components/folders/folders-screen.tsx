import { ArrowLeft, CirclePlus, Pencil, Trash2 } from "lucide-react";
import { DueCount } from "@/components/ui/due-count";
import { WordRowActions } from "@/components/words/word-row-actions";
import { useAppData } from "@/context/app-data-context";
import { useNavigation } from "@/context/navigation-context";
import { screenState, useScreenState } from "@/hooks/use-screen-state";
import { sameId } from "@/lib/ids";
import { deleteFolder } from "@/lib/supabase/data";
import type { Folder } from "@/lib/types";

const selectedFolderIdState = screenState<string | null>("folders.selected-folder-id", null);

export function FoldersScreen() {
    const { cards, setCards, folders, setFolders, setSyncStatus, getCloudContext } = useAppData();
    const { openWordDetail, openAddFolder, openEditFolder } = useNavigation();
    const [selectedFolderId, setSelectedFolderId] = useScreenState(selectedFolderIdState);
    const getFolderCards = (folderId: string) => cards.filter((card) => sameId(card.folderId, folderId));

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

    const selectedFolder = folders.find((folder) => folder.id === selectedFolderId);
    if (selectedFolder) {
        const selectedCards = getFolderCards(selectedFolder.id);
        return <section className="folder-detail"><button className="ghost-button" onClick={() => setSelectedFolderId(null)}><ArrowLeft size={14} /> All folders</button><div className="folder-detail-header"><div className="folder-color" style={{ background: selectedFolder.color }} /><div><div className="eyebrow">Folder</div><h2>{selectedFolder.name}</h2><p>{selectedFolder.description}</p></div></div><div className="folder-detail-list">{selectedCards.length ? selectedCards.map((card) => <div className="word-row" key={card.id}><div className="word-main"><button type="button" className="word-title word-title-button" onClick={() => openWordDetail(card)}><strong>{card.word}</strong></button><span>{card.meaning || "Meaning to be added"}</span></div><span className={`state-tag state-${card.state}`}>{card.state}</span><WordRowActions card={card} /></div>) : <div className="no-results">No words in this folder yet.</div>}</div></section>;
    }
    return <div className="folder-grid">{folders.map((folder) => { const folderCards = getFolderCards(folder.id); return <div className="folder-card" key={folder.id} onClick={(event) => { if ((event.target as HTMLElement).closest("button")) return; setSelectedFolderId(folder.id); }}><div className="folder-card-top"><div className="folder-color" style={{ background: folder.color }} /><div className="row-actions"><button className="icon-button" onClick={() => openEditFolder(folder)} aria-label={`Edit ${folder.name}`}><Pencil size={14} /></button><button className="icon-button danger-button" onClick={() => void removeFolder(folder)} aria-label={`Delete ${folder.name}`}><Trash2 size={14} /></button></div></div><h3>{folder.name}</h3><p>{folder.description}</p><div className="folder-meta"><span>{folderCards.length} {folderCards.length === 1 ? "word" : "words"}</span><span><DueCount cards={folderCards} /> due</span></div></div>; })}<button className="folder-card" onClick={openAddFolder} style={{ borderStyle: "dashed", alignItems: "center", justifyContent: "center", color: "var(--sage)" }}><CirclePlus size={22} /><span style={{ marginTop: 10, fontSize: 12, fontWeight: 700 }}>New folder</span></button></div>;
}
