import { PreferencesPanel } from "@/components/settings/preferences-panel";
import { TransferTools } from "@/components/settings/transfer-tools";

export function SettingsScreen({ darkMode, onDarkModeChange }: { darkMode: boolean; onDarkModeChange: (darkMode: boolean) => void }) {
    return <div className="settings-stack"><PreferencesPanel darkMode={darkMode} onDarkModeChange={onDarkModeChange} /><TransferTools /></div>;
}
