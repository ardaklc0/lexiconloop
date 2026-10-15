import { Check, X } from "lucide-react";
import { useAppData } from "@/context/app-data-context";
import { editingFolderIdState, folderFormState, useNavigation } from "@/context/navigation-context";
import { useScreenState } from "@/hooks/use-screen-state";
import { makeId } from "@/lib/ids";
import { insertFolder, updateFolder } from "@/lib/supabase/data";

export function AddFolderScreen() {
    const { folders, setFolders, setSyncStatus, getCloudContext } = useAppData();
    const { navigate, returnView } = useNavigation();
    const [folderForm, setFolderForm] = useScreenState(folderFormState);
    const [editingFolderId] = useScreenState(editingFolderIdState);

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
            navigate(returnView);
            setSyncStatus(cloud ? "Synced" : "Saved locally");
        } catch (error) {
            setSyncStatus(error instanceof Error ? error.message : "Folder could not be saved.");
        }
    }

    return <div className="modal add-word-page" role="region" aria-labelledby="folder-title"><div className="modal-header"><div><div className="eyebrow">Collection</div><h2 id="folder-title">{editingFolderId ? "Edit folder" : "New folder"}</h2><p>Keep a small set of related words together.</p></div><button className="icon-button" onClick={() => navigate(returnView)} aria-label="Close"><X size={17} /></button></div><form className="form-grid" onSubmit={saveFolder}><div className="field"><label htmlFor="folder-name">Name</label><input id="folder-name" required value={folderForm.name} onChange={(event) => { const name = event.target.value; setFolderForm((previous) => ({ ...previous, name })); }} placeholder="e.g. German B2" /></div><div className="field"><label htmlFor="folder-description">Description</label><textarea id="folder-description" value={folderForm.description} onChange={(event) => { const description = event.target.value; setFolderForm((previous) => ({ ...previous, description })); }} placeholder="A short note about this collection" /></div><div className="field"><label htmlFor="folder-color">Color</label><input id="folder-color" type="color" value={folderForm.color} onChange={(event) => { const color = event.target.value; setFolderForm((previous) => ({ ...previous, color })); }} /></div><div className="modal-footer"><button type="button" className="ghost-button" onClick={() => navigate(returnView)}>Cancel</button><button className="primary-button" type="submit"><Check size={15} /> Save folder</button></div></form></div>;
}
