export function speakWord(word: string, language: string) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = ({ German: "de-DE", Turkish: "tr-TR", English: "en-US", French: "fr-FR", Spanish: "es-ES", Italian: "it-IT" } as Record<string, string>)[language] ?? "en-US";
    utterance.rate = 0.85;
    window.speechSynthesis.speak(utterance);
}
