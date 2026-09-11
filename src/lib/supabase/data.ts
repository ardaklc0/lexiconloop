import type { SupabaseClient } from "@supabase/supabase-js";
import type { CefrLevel, Folder, ReviewLog, ReviewRating, WordRecord, Workspace } from "@/lib/types";

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
        client.from("words").select("id, folder_id, word, meaning, example_sentence, source_language, target_language, cefr_level, notes, created_at").eq("user_id", userId).eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
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
    userId: string,
    workspaceId: string,
    card: WordRecord,
    rating: ReviewRating,
    next: Pick<WordRecord, "state" | "stability" | "difficulty" | "dueAt" | "lastReviewedAt" | "reps" | "lapses">,
) {
    const [progressResponse, logResponse] = await Promise.all([
        client.from("word_progress").upsert({
            user_id: userId,
            workspace_id: workspaceId,
            word_id: card.id,
            state: next.state,
            stability: next.stability,
            difficulty: next.difficulty,
            due_at: next.dueAt,
            last_review_at: next.lastReviewedAt,
            reps: next.reps,
            lapses: next.lapses,
            updated_at: new Date().toISOString(),
        }, { onConflict: "word_id" }),
        client.from("review_logs").insert({
            user_id: userId,
            workspace_id: workspaceId,
            word_id: card.id,
            rating,
            reviewed_at: next.lastReviewedAt,
            previous_state: card.state,
            new_state: next.state,
            previous_due_at: card.dueAt,
            new_due_at: next.dueAt,
        }),
    ]);

    if (progressResponse.error || logResponse.error) {
        throw new Error(progressResponse.error?.message ?? logResponse.error?.message ?? "Review could not be saved.");
    }
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

export async function updateWord(client: SupabaseClient, userId: string, workspaceId: string, wordId: string, input: Pick<WordRecord, "word" | "meaning" | "exampleSentence" | "folderId" | "sourceLanguage" | "targetLanguage" | "cefrLevel" | "notes">) {
    const { error } = await client.from("words").update({
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
