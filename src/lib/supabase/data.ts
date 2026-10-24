import type { SupabaseClient } from "@supabase/supabase-js";
import type { CefrLevel, Folder, ReviewLog, ReviewRating, SentenceFeedback, WordFamily, WordForms, WordRecord, Workspace } from "@/lib/types";

type WorkspaceRow = Workspace;

type FolderRow = {
    id: string;
    name: string;
    description: string;
    color: string;
};

type WordRow = {
    id: string;
    folder_id: string | null;
    word: string;
    meaning: string;
    example_sentence: string | null;
    source_language: string;
    target_language: string;
    cefr_level: CefrLevel | null;
    notes: string | null;
    forms: WordForms | null;
    word_family: WordFamily | null;
    cloze_sentences: string[] | null;
    created_at: string;
};

type ProgressRow = {
    word_id: string;
    state: WordRecord["state"];
    stability: number;
    difficulty: number;
    due_at: string;
    last_review_at: string | null;
    reps: number;
    lapses: number;
};

type ReviewLogRow = {
    id: string;
    word_id: string;
    rating: ReviewRating;
    reviewed_at: string;
};

export async function loadWorkspaces(client: SupabaseClient, userId: string) {
    const { data, error } = await client.from("workspaces").select("id, name").eq("owner_id", userId).order("created_at");
    if (error) throw new Error(error.message);
    return (data ?? []) as WorkspaceRow[];
}

export async function insertWorkspace(client: SupabaseClient, userId: string, name: string) {
    const { data, error } = await client.from("workspaces").insert({ owner_id: userId, name }).select("id, name").single();
    if (error || !data) throw new Error(error?.message ?? "Workspace could not be created.");
    const { error: memberError } = await client.from("workspace_members").insert({ workspace_id: data.id, user_id: userId, role: "owner" });
    if (memberError) throw new Error(memberError.message);
    return data as WorkspaceRow;
}

export async function deleteWorkspace(client: SupabaseClient, userId: string, workspaceId: string) {
    const { error } = await client.from("workspaces").delete().eq("id", workspaceId).eq("owner_id", userId);
    if (error) throw new Error(error.message);
}

export async function loadUserData(client: SupabaseClient, userId: string, workspaceId: string) {
    const [foldersResponse, wordsResponse, progressResponse, logsResponse] = await Promise.all([
        client.from("folders").select("id, name, description, color").eq("user_id", userId).eq("workspace_id", workspaceId).order("created_at"),
        client.from("words").select("id, folder_id, word, meaning, example_sentence, source_language, target_language, cefr_level, notes, forms, word_family, cloze_sentences, created_at").eq("user_id", userId).eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
        client.from("word_progress").select("word_id, state, stability, difficulty, due_at, last_review_at, reps, lapses").eq("user_id", userId).eq("workspace_id", workspaceId),
        client.from("review_logs").select("id, word_id, rating, reviewed_at").eq("user_id", userId).eq("workspace_id", workspaceId).order("reviewed_at", { ascending: false }),
    ]);

    const error = foldersResponse.error ?? wordsResponse.error ?? progressResponse.error ?? logsResponse.error;
    if (error) throw new Error(error.message);

    const folderRows = (foldersResponse.data ?? []) as FolderRow[];
    const wordRows = (wordsResponse.data ?? []) as WordRow[];
    const progressRows = (progressResponse.data ?? []) as ProgressRow[];
    const logRows = (logsResponse.data ?? []) as ReviewLogRow[];
    const progressByWord = new Map(progressRows.map((progress) => [progress.word_id, progress]));

    const folders: Folder[] = folderRows.map((folder) => ({
        id: folder.id,
        name: folder.name,
        description: folder.description,
        color: folder.color,
    }));

    const cards: WordRecord[] = wordRows.map((word) => {
        const progress = progressByWord.get(word.id);
        return {
            id: word.id,
            word: word.word,
            meaning: word.meaning,
            exampleSentence: word.example_sentence ?? undefined,
            folderId: word.folder_id ?? "",
            sourceLanguage: word.source_language,
            targetLanguage: word.target_language,
            cefrLevel: word.cefr_level ?? undefined,
            notes: word.notes ?? undefined,
            forms: word.forms ?? undefined,
            wordFamily: word.word_family ?? undefined,
            clozeSentences: word.cloze_sentences ?? undefined,
            createdAt: word.created_at,
            state: progress?.state ?? "new",
            stability: progress?.stability ?? 0.25,
            difficulty: progress?.difficulty ?? 5,
            dueAt: progress?.due_at ?? new Date().toISOString(),
            lastReviewedAt: progress?.last_review_at ?? undefined,
            reps: progress?.reps ?? 0,
            lapses: progress?.lapses ?? 0,
        };
    });

    const logs: ReviewLog[] = logRows.map((log) => ({
        id: log.id,
        wordId: log.word_id,
        rating: log.rating,
        reviewedAt: log.reviewed_at,
    }));

    return { folders, cards, logs };
}

export async function insertWord(
    client: SupabaseClient,
    userId: string,
    workspaceId: string,
    input: Pick<WordRecord, "word" | "meaning" | "exampleSentence" | "folderId" | "sourceLanguage" | "targetLanguage" | "cefrLevel" | "notes">,
) {
    const { data: wordData, error: wordError } = await client
        .from("words")
        .insert({
            user_id: userId,
            workspace_id: workspaceId,
            folder_id: input.folderId || null,
            word: input.word,
            meaning: input.meaning,
            example_sentence: input.exampleSentence ?? null,
            source_language: input.sourceLanguage,
            target_language: input.targetLanguage,
            cefr_level: input.cefrLevel ?? null,
            notes: input.notes ?? null,
        })
        .select("id, created_at")
        .single();

    if (wordError || !wordData) throw new Error(wordError?.message ?? "Word could not be created.");

    const { error: progressError } = await client.from("word_progress").insert({
        user_id: userId,
        workspace_id: workspaceId,
        word_id: wordData.id,
        state: "new",
        stability: 0.25,
        difficulty: 5,
        due_at: new Date().toISOString(),
        reps: 0,
        lapses: 0,
    });

    if (progressError) {
        await client.from("words").delete().eq("id", wordData.id).eq("user_id", userId);
        throw new Error(progressError.message);
    }

    return { id: wordData.id, createdAt: wordData.created_at };
}

export async function saveReview(
    client: SupabaseClient,
    workspaceId: string,
    card: WordRecord,
    rating: ReviewRating,
    next: Pick<WordRecord, "state" | "stability" | "difficulty" | "dueAt" | "lastReviewedAt" | "reps" | "lapses">,
) {
    const { error } = await client.rpc("save_review", {
        p_workspace_id: workspaceId,
        p_word_id: card.id,
        p_rating: rating,
        p_new_state: next.state,
        p_stability: next.stability,
        p_difficulty: next.difficulty,
        p_due_at: next.dueAt,
        p_reviewed_at: next.lastReviewedAt,
        p_reps: next.reps,
        p_lapses: next.lapses,
        p_previous_state: card.state,
        p_previous_due_at: card.dueAt,
    });

    if (error) throw new Error(error.message);
}

export async function insertFolder(client: SupabaseClient, userId: string, workspaceId: string, input: Pick<Folder, "name" | "description" | "color">) {
    const { data, error } = await client
        .from("folders")
        .insert({ user_id: userId, workspace_id: workspaceId, name: input.name, description: input.description, color: input.color })
        .select("id, name, description, color")
        .single();

    if (error || !data) throw new Error(error?.message ?? "Folder could not be created.");
    return data as FolderRow;
}

export async function updateWord(client: SupabaseClient, userId: string, workspaceId: string, wordId: string, input: Pick<WordRecord, "word" | "meaning" | "exampleSentence" | "folderId" | "sourceLanguage" | "targetLanguage" | "cefrLevel" | "notes"> & { resetForms?: boolean }) {
    const { error } = await client.from("words").update({
        // Grammar forms belong to the old spelling/language; the app fills them in again on the next review.
        ...(input.resetForms ? { forms: null, word_family: null, cloze_sentences: null } : {}),
        word: input.word,
        meaning: input.meaning,
        example_sentence: input.exampleSentence ?? null,
        folder_id: input.folderId || null,
        source_language: input.sourceLanguage,
        target_language: input.targetLanguage,
        cefr_level: input.cefrLevel ?? null,
        notes: input.notes ?? null,
        updated_at: new Date().toISOString(),
    }).eq("id", wordId).eq("user_id", userId).eq("workspace_id", workspaceId);

    if (error) throw new Error(error.message);
}

export async function deleteWord(client: SupabaseClient, userId: string, workspaceId: string, wordId: string) {
    const { error } = await client.from("words").delete().eq("id", wordId).eq("user_id", userId).eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
}

export async function updateFolder(client: SupabaseClient, userId: string, workspaceId: string, folderId: string, input: Pick<Folder, "name" | "description" | "color">) {
    const { error } = await client.from("folders").update({
        name: input.name,
        description: input.description,
        color: input.color,
        updated_at: new Date().toISOString(),
    }).eq("id", folderId).eq("user_id", userId).eq("workspace_id", workspaceId);

    if (error) throw new Error(error.message);
}

export async function deleteFolder(client: SupabaseClient, userId: string, workspaceId: string, folderId: string) {
    const { error } = await client.from("folders").delete().eq("id", folderId).eq("user_id", userId).eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
}

export async function saveWordForms(client: SupabaseClient, userId: string, workspaceId: string, wordId: string, forms: WordForms) {
    const { error } = await client.from("words").update({ forms }).eq("id", wordId).eq("user_id", userId).eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
}

export async function insertSentenceAttempt(client: SupabaseClient, userId: string, workspaceId: string, wordId: string, sentence: string, feedback: SentenceFeedback) {
    const { error } = await client.from("sentence_attempts").insert({
        user_id: userId,
        workspace_id: workspaceId,
        word_id: wordId,
        sentence,
        corrected: feedback.corrected,
        is_natural: feedback.isNatural,
        cefr_estimate: feedback.cefrLevel ?? null,
        errors: feedback.errors,
    });
    if (error) throw new Error(error.message);
}

export async function saveWordFamily(client: SupabaseClient, userId: string, workspaceId: string, wordId: string, family: WordFamily) {
    const { error } = await client.from("words").update({ word_family: family }).eq("id", wordId).eq("user_id", userId).eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
}

export async function saveClozeSentences(client: SupabaseClient, userId: string, workspaceId: string, wordId: string, sentences: string[]) {
    const { error } = await client.from("words").update({ cloze_sentences: sentences }).eq("id", wordId).eq("user_id", userId).eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
}

export type GrammarAttemptInput = {
    wordId: string;
    mode: "reverse" | "cloze" | "form";
    formKind?: "article" | "plural" | "perfect" | "pastSimple" | "prefix";
    grade: "exact" | "accent" | "close" | "wrong";
    skipped: boolean;
};

export async function insertGrammarAttempt(client: SupabaseClient, userId: string, workspaceId: string, input: GrammarAttemptInput) {
    const { error } = await client.from("grammar_attempts").insert({
        user_id: userId,
        workspace_id: workspaceId,
        word_id: input.wordId,
        mode: input.mode,
        form_kind: input.formKind ?? null,
        grade: input.grade,
        skipped: input.skipped,
    });
    if (error) throw new Error(error.message);
}

export type RecentGrammarAttempt = Omit<GrammarAttemptInput, "wordId"> & { wordId: string; createdAt: string };
export type RecentSentenceAttempt = { wordId: string; isNatural: boolean | null; cefrEstimate: string | null; errors: Array<{ type: string; explanation: string }>; createdAt: string };

export async function loadRecentAttempts(client: SupabaseClient, userId: string, workspaceId: string, sinceIso: string) {
    const [grammar, sentences] = await Promise.all([
        client.from("grammar_attempts").select("word_id, mode, form_kind, grade, skipped, created_at").eq("user_id", userId).eq("workspace_id", workspaceId).gte("created_at", sinceIso),
        client.from("sentence_attempts").select("word_id, is_natural, cefr_estimate, errors, created_at").eq("user_id", userId).eq("workspace_id", workspaceId).gte("created_at", sinceIso),
    ]);
    const error = grammar.error ?? sentences.error;
    if (error) throw new Error(error.message);
    return {
        grammar: (grammar.data ?? []).map((row): RecentGrammarAttempt => ({ wordId: row.word_id, mode: row.mode, formKind: row.form_kind ?? undefined, grade: row.grade, skipped: row.skipped, createdAt: row.created_at })),
        sentences: (sentences.data ?? []).map((row): RecentSentenceAttempt => ({ wordId: row.word_id, isNatural: row.is_natural, cefrEstimate: row.cefr_estimate, errors: Array.isArray(row.errors) ? row.errors : [], createdAt: row.created_at })),
    };
}

export async function loadWeeklySummary<T>(client: SupabaseClient, userId: string, workspaceId: string, weekStart: string) {
    const { data, error } = await client.from("weekly_summaries").select("summary").eq("user_id", userId).eq("workspace_id", workspaceId).eq("week_start", weekStart).maybeSingle();
    if (error) throw new Error(error.message);
    return (data?.summary as T | undefined) ?? null;
}

export async function saveWeeklySummary(client: SupabaseClient, userId: string, workspaceId: string, weekStart: string, summary: unknown) {
    const { error } = await client.from("weekly_summaries").upsert({ user_id: userId, workspace_id: workspaceId, week_start: weekStart, summary }, { onConflict: "workspace_id,week_start" });
    if (error) throw new Error(error.message);
}
