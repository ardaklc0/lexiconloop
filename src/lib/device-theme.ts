export type DeviceTheme = "light" | "dark";

export function getDeviceTheme(): DeviceTheme {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyDeviceTheme(theme: DeviceTheme) {
    document.documentElement.dataset.theme = theme;
}

export function watchDeviceTheme(onChange: (theme: DeviceTheme) => void) {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => onChange(mediaQuery.matches ? "dark" : "light");
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
}
