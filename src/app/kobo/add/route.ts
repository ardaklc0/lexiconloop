import { POST as generateWordDetails } from "@/app/api/generate-sentence/route";
import { html, koboPage, notice } from "@/lib/kobo/html";
import { errorMessage, loadFolders, redirectTo, withKoboSession, type KoboSession } from "@/lib/kobo/session";
import { cefrLevels, languageOptions } from "@/lib/constants";
import { insertWord } from "@/lib/supabase/data";
import type { CefrLevel, Folder } from "@/lib/types";

type WordFields = { word: string; meaning: string; exampleSentence: string; sourceLanguage: string; targetLanguage: string; cefrLevel: CefrLevel | ""; folderId: string; notes: string };

const select = (name: string, label: string, value: string, options: Array<[string, string]>) =>
    html`<label for="${name}">${label}</label><select id="${name}" name="${name}">${options.map(([optionValue, optionLabel]) => html`<option value="${optionValue}"${optionValue === value ? html` selected` : null}>${optionLabel}</option>`)}</select>`;

function addPage(fields: WordFields, folders: Folder[], messages: { info?: string | null; error?: string | null } = {}) {
    const languages = languageOptions.map((language): [string, string] => [language, language]);
    return koboPage({
        title: "Add a word",
        section: "add",
        body: html`<h1>Add a word</h1>
            ${notice(messages.error, "error")}${notice(messages.info)}
            <form method="post" action="/kobo/add">
                <table class="pair"><tr><td>${select("source", "Source language", fields.sourceLanguage, languages)}</td><td>${select("target", "Target language", fields.targetLanguage, languages)}</td></tr></table>
                <label for="word">Word or phrase</label>
                <input id="word" name="word" value="${fields.word}" autocapitalize="off" autocorrect="off">
                <button type="submit" name="intent" value="generate">Generate meaning and example</button>
                <label for="meaning">Meaning in target language</label>
                <textarea id="meaning" name="meaning">${fields.meaning}</textarea>
                <label for="example">Example sentence</label>
                <textarea id="example" name="example">${fields.exampleSentence}</textarea>
                ${select("cefr", "Estimated CEFR level", fields.cefrLevel, [["", "Not set"], ...cefrLevels.map((level): [string, string] => [level, level])])}
                ${select("folder", "Folder", fields.folderId, [["", "Unsorted"], ...folders.map((folder): [string, string] => [folder.id, folder.name])])}
                <label for="notes">Notes (optional)</label>
                <textarea id="notes" name="notes">${fields.notes}</textarea>
                <button class="primary" type="submit" name="intent" value="save">Save word</button>
            </form>`,
    });
}

const readFields = (form: FormData): WordFields => {
    const text = (name: string) => String(form.get(name) ?? "");
    const cefrLevel = cefrLevels.find((level) => level === form.get("cefr")) ?? "";
    return { word: text("word"), meaning: text("meaning"), exampleSentence: text("example"), sourceLanguage: text("source") || "German", targetLanguage: text("target") || "Turkish", cefrLevel, folderId: text("folder"), notes: text("notes") };
};

async function generate(request: Request, fields: WordFields): Promise<WordFields> {
    // Reuse the website's Gemini route as-is, including its sign-in check.
    const response = await generateWordDetails(new Request(new URL("/api/generate-sentence", request.url), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: fields.word, sourceLanguage: fields.sourceLanguage, targetLanguage: fields.targetLanguage }),
    }));
    const data = await response.json() as { meaning?: string; sentence?: string; cefrLevel?: CefrLevel; error?: string };
    if (!response.ok) throw new Error(data.error ?? "Generation failed");
    return { ...fields, meaning: data.meaning ?? "", exampleSentence: data.sentence ?? "", cefrLevel: data.cefrLevel ?? "" };
}

async function save(session: KoboSession, fields: WordFields) {
    await insertWord(session.supabase, session.userId, session.workspace.id, {
        word: fields.word.trim(),
        meaning: fields.meaning.trim(),
        exampleSentence: fields.exampleSentence.trim() || undefined,
        folderId: fields.folderId,
        sourceLanguage: fields.sourceLanguage,
        targetLanguage: fields.targetLanguage,
        cefrLevel: fields.cefrLevel || undefined,
        notes: fields.notes.trim() || undefined,
    });
}

export async function GET(request: Request) {
    return withKoboSession(request, async (session) => {
        const params = new URL(request.url).searchParams;
        const folders = await loadFolders(session);
        const folderParam = params.get("folder");
        const saved = params.get("saved");
        return addPage({
            word: "", meaning: "", exampleSentence: "", cefrLevel: "", notes: "",
            sourceLanguage: params.get("source") || "German",
            targetLanguage: params.get("target") || "Turkish",
            folderId: folderParam ?? folders[0]?.id ?? "",
        }, folders, { info: saved ? `Saved “${saved}”. Add another word or go back to Review.` : null });
    });
}

export async function POST(request: Request) {
    return withKoboSession(request, async (session) => {
        const form = await request.formData();
        const fields = readFields(form);
        const folders = await loadFolders(session);
        if (!fields.word.trim()) return addPage(fields, folders, { error: "Enter a word or phrase first." });

        if (form.get("intent") === "generate") {
            try {
                return addPage(await generate(request, fields), folders, { info: "AI content ready to edit." });
            } catch (error) {
                return addPage(fields, folders, { error: errorMessage(error, "Could not generate word information.") });
            }
        }

        try {
            await save(session, fields);
        } catch (error) {
            return addPage(fields, folders, { error: errorMessage(error, "Word could not be saved.") });
        }
        const next = new URLSearchParams({ saved: fields.word.trim(), source: fields.sourceLanguage, target: fields.targetLanguage, folder: fields.folderId });
        return redirectTo(request, `/kobo/add?${next}`);
    });
}
