import { useMemo } from "react";
import { Search, Settings2 } from "lucide-react";
import { DueIn } from "@/components/ui/due-in";
import { WordDetail } from "@/components/words/word-detail";
import { WordFiltersPanel } from "@/components/words/word-filters-panel";
import { WordRowActions } from "@/components/words/word-row-actions";
import { useAppData } from "@/context/app-data-context";
import { selectedWordIdState, useNavigation } from "@/context/navigation-context";
import { useToday } from "@/hooks/use-clock";
import { screenState, useScreenState } from "@/hooks/use-screen-state";
import { defaultWordFilters, filterWords, type WordSort } from "@/lib/word-filters";

const filtersState = screenState("words.filters", defaultWordFilters);
const filtersOpenState = screenState("words.filters-open", false);

export function WordsScreen() {
    const [selectedWordId] = useScreenState(selectedWordIdState);
    if (selectedWordId) return <WordDetail />;
    return <WordList />;
}

function WordList() {
    const { cards, folders } = useAppData();
    const { openWordDetail } = useNavigation();
    const [filters, setFilters] = useScreenState(filtersState);
    const [filtersOpen, setFiltersOpen] = useScreenState(filtersOpenState);
    // The "overdue / today / upcoming" filter only depends on the day, so the list re-filters at midnight, not every second.
    const today = useToday();
    const visibleCards = useMemo(() => filterWords(cards, folders, filters, today), [cards, filters, folders, today]);
    const wordFilterCount = filters.states.length + [filters.sourceLanguage, filters.targetLanguage, filters.folderId, filters.cefrLevel, filters.reviewStatus].filter((value) => value !== "all").length + (filters.searchFields.length < 4 ? 1 : 0);

    return <><div className="view-toolbar"><div className="search-box"><Search size={15} /><input value={filters.search} onChange={(event) => { const search = event.target.value; setFilters((previous) => ({ ...previous, search })); }} placeholder="Search vocabulary..." /></div><label className="word-sort-control">Sort<select aria-label="Sort words" value={filters.sort} onChange={(event) => { const sort = event.target.value as WordSort; setFilters((previous) => ({ ...previous, sort })); }}><option value="added-newest">Recently added</option><option value="added-oldest">Oldest added</option><option value="due-soonest">Due soonest</option><option value="due-latest">Due latest</option><option value="status">Card status</option><option value="folder">Folder A–Z</option><option value="language">Source language A–Z</option></select></label><button className={`ghost-button filter-toggle ${filtersOpen ? "active" : ""}`} onClick={() => setFiltersOpen((value) => !value)}><Settings2 size={14} /> Filters{wordFilterCount ? ` (${wordFilterCount})` : ""}</button></div>{filtersOpen && <WordFiltersPanel filters={filters} onChange={setFilters} />}<div className="filter-result-count">Showing {visibleCards.length} of {cards.length} words</div><div className="word-list">{visibleCards.length ? visibleCards.map((card) => <div className="word-row" key={card.id}><div className="word-main"><button type="button" className="word-title word-title-button" onClick={() => openWordDetail(card)}><strong>{card.word}</strong></button><span>{card.meaning || "Meaning to be added"}</span></div><div className="word-folder">{folders.find((folder) => folder.id === card.folderId)?.name ?? "Unsorted"}</div><div><span className={`state-tag state-${card.state}`}>{card.state}</span></div><div className="word-due"><DueIn dueAt={card.dueAt} /></div><WordRowActions card={card} /></div>) : <div className="no-results">No words match these filters.</div>}</div></>;
}
