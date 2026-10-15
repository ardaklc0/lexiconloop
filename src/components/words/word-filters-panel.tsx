import { useMemo } from "react";
import { FilterSelect, folderFilterOptions } from "@/components/ui/filter-select";
import { useAppData } from "@/context/app-data-context";
import { cefrLevels } from "@/lib/constants";
import type { CardState } from "@/lib/types";
import { collectLanguages, defaultWordFilters, type SearchField, type WordFilters } from "@/lib/word-filters";

const reviewStatusOptions = [{ value: "overdue", label: "Overdue" }, { value: "today", label: "Due today" }, { value: "upcoming", label: "Upcoming" }, { value: "unreviewed", label: "Never reviewed" }];
const searchFieldOptions: Array<[SearchField, string]> = [["word", "Word"], ["meaning", "Meaning"], ["exampleSentence", "Example"], ["notes", "Notes"]];

const toggle = <T,>(items: T[], item: T) => items.includes(item) ? items.filter((value) => value !== item) : [...items, item];

export function WordFiltersPanel({ filters, onChange }: { filters: WordFilters; onChange: (update: (previous: WordFilters) => WordFilters) => void }) {
    const { cards, folders } = useAppData();
    const sourceLanguages = useMemo(() => collectLanguages(cards, "sourceLanguage"), [cards]);
    const targetLanguages = useMemo(() => collectLanguages(cards, "targetLanguage"), [cards]);
    const updateFilter = <K extends keyof WordFilters>(key: K, value: WordFilters[K]) => onChange((previous) => ({ ...previous, [key]: value }));
    const clearFilters = () => onChange((previous) => ({ ...defaultWordFilters, search: previous.search, sort: previous.sort }));

    return <div className="filter-panel word-filter-panel"><div className="filter-panel-head"><strong>Vocabulary filters</strong><button type="button" className="text-button" onClick={clearFilters}>Clear</button></div><div className="filter-grid">
        <FilterSelect label="Source language" value={filters.sourceLanguage} options={sourceLanguages} onChange={(value) => updateFilter("sourceLanguage", value)} />
        <FilterSelect label="Target language" value={filters.targetLanguage} options={targetLanguages} onChange={(value) => updateFilter("targetLanguage", value)} />
        <FilterSelect label="Folder" value={filters.folderId} options={folderFilterOptions(folders)} onChange={(value) => updateFilter("folderId", value)} />
        <FilterSelect label="CEFR" value={filters.cefrLevel} options={cefrLevels} onChange={(value) => updateFilter("cefrLevel", value)} />
        <FilterSelect label="Review status" value={filters.reviewStatus} options={reviewStatusOptions} onChange={(value) => updateFilter("reviewStatus", value)} />
    </div><div className="filter-section"><span className="filter-label">Card status</span><div className="filter-row">{(["new", "learning", "review", "mastered"] as CardState[]).map((state) => <button type="button" className={`filter-chip ${filters.states.includes(state) ? "active" : ""}`} key={state} onClick={() => onChange((previous) => ({ ...previous, states: toggle(previous.states, state) }))}>{state[0].toUpperCase() + state.slice(1)}</button>)}</div></div><div className="filter-section"><span className="filter-label">Search in</span><div className="filter-row">{searchFieldOptions.map(([field, label]) => <button type="button" className={`filter-chip ${filters.searchFields.includes(field) ? "active" : ""}`} key={field} onClick={() => onChange((previous) => ({ ...previous, searchFields: toggle(previous.searchFields, field) }))}>{label}</button>)}</div></div></div>;
}
