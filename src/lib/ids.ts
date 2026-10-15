export const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const sameId = (first: string | null | undefined, second: string | null | undefined) =>
    Boolean(first && second && first.trim().toLowerCase() === second.trim().toLowerCase());
