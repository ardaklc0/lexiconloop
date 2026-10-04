export type VocabularyEntry = {
    word: string;
    meaning: string;
    exampleSentence?: string;
    sourceLanguage: string;
    targetLanguage: string;
    folderName?: string;
    cefrLevel?: string;
    notes?: string;
};

const fieldAliases: Record<string, keyof VocabularyEntry> = {
    word: "word",
    front: "word",
    term: "word",
    meaning: "meaning",
    back: "meaning",
    translation: "meaning",
    definition: "meaning",
    examplesentence: "exampleSentence",
    example: "exampleSentence",
    sentence: "exampleSentence",
    sourcelanguage: "sourceLanguage",
    language: "sourceLanguage",
    targetlanguage: "targetLanguage",
    folder: "folderName",
    foldername: "folderName",
    cefr: "cefrLevel",
    cefrlevel: "cefrLevel",
    notes: "notes",
};

function normalizeHeader(value: string) {
    return value.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[\s_-]/g, "");
}

function parseDelimited(text: string, delimiter: string) {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
        const character = text[index];
        if (character === '"') {
            if (quoted && text[index + 1] === '"') {
                field += '"';
                index += 1;
            } else {
                quoted = !quoted;
            }
        } else if (character === delimiter && !quoted) {
            row.push(field);
            field = "";
        } else if ((character === "\n" || character === "\r") && !quoted) {
            if (character === "\r" && text[index + 1] === "\n") index += 1;
            row.push(field);
            if (row.some((value) => value.trim())) rows.push(row);
            row = [];
            field = "";
        } else {
            field += character;
        }
    }

    row.push(field);
    if (row.some((value) => value.trim())) rows.push(row);
    return rows;
}

function entriesFromRows(rows: string[][]): VocabularyEntry[] {
    if (!rows.length) return [];
    const headers = rows[0].map(normalizeHeader);
    const hasHeaders = headers.some((header) => header in fieldAliases);
    const columns = hasHeaders
        ? headers.map((header) => fieldAliases[header])
        : ["word", "meaning", "exampleSentence", "notes"] as Array<keyof VocabularyEntry>;
    const dataRows = hasHeaders ? rows.slice(1) : rows;

    return dataRows.map((values) => {
        const entry: Partial<VocabularyEntry> = {};
        columns.forEach((column, index) => {
            if (column) entry[column] = values[index]?.trim() ?? "";
        });
        return {
            word: entry.word?.trim() ?? "",
            meaning: entry.meaning?.trim() ?? "",
            exampleSentence: entry.exampleSentence?.trim() || undefined,
            sourceLanguage: entry.sourceLanguage?.trim() || "German",
            targetLanguage: entry.targetLanguage?.trim() || "Turkish",
            folderName: entry.folderName?.trim() || undefined,
            cefrLevel: entry.cefrLevel?.trim() || undefined,
            notes: entry.notes?.trim() || undefined,
        };
    });
}

export function parseVocabularyFile(fileName: string, contents: string): VocabularyEntry[] {
    if (fileName.toLowerCase().endsWith(".json")) {
        const parsed: unknown = JSON.parse(contents);
        const values = Array.isArray(parsed)
            ? parsed
            : parsed && typeof parsed === "object" && "words" in parsed && Array.isArray(parsed.words)
                ? parsed.words
                : null;
        if (!values) throw new Error("JSON must contain a list of words.");
        return values.map((value) => {
            if (!value || typeof value !== "object") return { word: "", meaning: "", sourceLanguage: "German", targetLanguage: "Turkish" };
            const item = value as Record<string, unknown>;
            const read = (...keys: string[]) => {
                const found = keys.map((key) => item[key]).find((candidate) => typeof candidate === "string");
                return typeof found === "string" ? found.trim() : "";
            };
            return {
                word: read("word", "front", "term"),
                meaning: read("meaning", "back", "translation", "definition"),
                exampleSentence: read("exampleSentence", "example", "sentence") || undefined,
                sourceLanguage: read("sourceLanguage", "source_language", "language") || "German",
                targetLanguage: read("targetLanguage", "target_language") || "Turkish",
                folderName: read("folderName", "folder") || undefined,
                cefrLevel: read("cefrLevel", "cefr_level", "cefr") || undefined,
                notes: read("notes") || undefined,
            };
        });
    }

    const firstLine = contents.split(/\r?\n/, 1)[0] ?? "";
    const delimiter = fileName.toLowerCase().endsWith(".tsv") || fileName.toLowerCase().endsWith(".txt")
        ? "\t"
        : [",", ";", "\t"].sort((first, second) => firstLine.split(second).length - firstLine.split(first).length)[0];
    return entriesFromRows(parseDelimited(contents, delimiter));
}

function csvCell(value: string | undefined) {
    const text = value ?? "";
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const exportHeaders = ["word", "meaning", "exampleSentence", "sourceLanguage", "targetLanguage", "folder", "cefrLevel", "notes"];

export function serializeVocabulary(entries: VocabularyEntry[], format: "csv" | "json" | "anki") {
    if (format === "json") {
        return JSON.stringify({ format: "lexicon-loop-vocabulary", version: 1, words: entries }, null, 2);
    }
    if (format === "anki") {
        return entries.map((entry) => [entry.word, entry.meaning, entry.exampleSentence ?? ""]
            .map((value) => value.replace(/[\t\r\n]+/g, " "))
            .join("\t")).join("\n");
    }
    const rows = entries.map((entry) => [entry.word, entry.meaning, entry.exampleSentence, entry.sourceLanguage, entry.targetLanguage, entry.folderName, entry.cefrLevel, entry.notes]);
    return [exportHeaders, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}