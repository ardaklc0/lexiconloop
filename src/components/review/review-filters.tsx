import { useMemo } from "react";
import { FilterSelect, folderFilterOptions } from "@/components/ui/filter-select";
import { useAppData } from "@/context/app-data-context";
import { useReview } from "@/context/review-context";
import { cefrLevels } from "@/lib/constants";
import { collectLanguages, type ReviewDueMode, type ReviewFilters, type ReviewSort } from "@/lib/word-filters";

export function ReviewFilterPanel() {
    const { cards, folders } = useAppData();
    const { filters, updateFilter, clearFilters, setIsFlipped } = useReview();
    const sourceLanguages = useMemo(() => collectLanguages(cards, "sourceLanguage"), [cards]);
    const targetLanguages = useMemo(() => collectLanguages(cards, "targetLanguage"), [cards]);
    const changeReviewSet = <K extends keyof ReviewFilters>(key: K, value: ReviewFilters[K]) => {
        updateFilter(key, value);
        setIsFlipped(false);
    };

    return <div className="filter-panel review-filter-panel">
        <div className="filter-panel-head"><strong>Review set</strong><button type="button" className="text-button" onClick={clearFilters}>Clear</button></div>
        <div className="filter-grid">
            <FilterSelect label="Source language" value={filters.sourceLanguage} options={sourceLanguages} onChange={(value) => changeReviewSet("sourceLanguage", value)} />
            <FilterSelect label="Target language" value={filters.targetLanguage} options={targetLanguages} onChange={(value) => changeReviewSet("targetLanguage", value)} />
            <FilterSelect label="Folder" value={filters.folderId} options={folderFilterOptions(folders)} onChange={(value) => changeReviewSet("folderId", value)} />
            <FilterSelect label="CEFR" value={filters.cefrLevel} options={cefrLevels} onChange={(value) => changeReviewSet("cefrLevel", value)} />
            <label>Cards<select value={filters.dueMode} onChange={(event) => changeReviewSet("dueMode", event.target.value as ReviewDueMode)}><option value="due">Due only</option><option value="all">All cards</option></select></label>
            <label>Sort<select value={filters.sort} onChange={(event) => updateFilter("sort", event.target.value as ReviewSort)}><option value="oldest-due">Oldest due</option><option value="most-errors">Most errors</option><option value="random">Random</option></select></label>
        </div>
    </div>;
}
