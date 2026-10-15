type FilterOption = string | { value: string; label: string };

/** A labelled filter dropdown whose first option is "All". */
export function FilterSelect<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: FilterOption[]; onChange: (value: T) => void }) {
    return <label>{label}<select value={value} onChange={(event) => onChange(event.target.value as T)}><option value="all">All</option>{options.map((option) => {
        const { value: optionValue, label: optionLabel } = typeof option === "string" ? { value: option, label: option } : option;
        return <option value={optionValue} key={optionValue}>{optionLabel}</option>;
    })}</select></label>;
}

/** Folder options for a FilterSelect, including the "Unsorted" bucket. */
export const folderFilterOptions = (folders: Array<{ id: string; name: string }>): FilterOption[] =>
    [{ value: "unsorted", label: "Unsorted" }, ...folders.map((folder) => ({ value: folder.id, label: folder.name }))];
