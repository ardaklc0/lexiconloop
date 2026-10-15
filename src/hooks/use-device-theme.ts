import { useEffect, useState } from "react";
import { applyDeviceTheme, watchDeviceTheme } from "@/lib/device-theme";

export function useDeviceTheme() {
    const [darkMode, setDarkMode] = useState(false);

    useEffect(() => {
        return watchDeviceTheme((theme) => {
            setDarkMode(theme === "dark");
            applyDeviceTheme(theme);
        });
    }, []);

    useEffect(() => {
        applyDeviceTheme(darkMode ? "dark" : "light");
    }, [darkMode]);

    return [darkMode, setDarkMode] as const;
}
