// Plain server-rendered HTML for the Kobo e-reader browser (an old WebKit).
// No JavaScript, no CSS variables, no flexbox/grid: tables and blocks only,
// black on white with thick borders and large tap targets for e-ink.

export class Html {
    constructor(readonly value: string) {}
    toString() {
        return this.value;
    }
}

type Part = Html | string | number | boolean | null | undefined | Part[];

const escapes: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => escapes[character]);

const render = (part: Part): string => {
    if (part instanceof Html) return part.value;
    if (Array.isArray(part)) return part.map(render).join("");
    if (part === null || part === undefined || typeof part === "boolean") return "";
    return escapeHtml(String(part));
};

/** Tagged template that escapes every interpolated value unless it is already Html. */
export const html = (strings: TemplateStringsArray, ...values: Part[]) =>
    new Html(strings.reduce((output, text, index) => output + text + (index < values.length ? render(values[index]) : ""), ""));

export type KoboSection = "review" | "words" | "add" | "stats" | "settings";

const navItems: Array<[KoboSection, string, string]> = [
    ["review", "Review", "/kobo"],
    ["words", "Words", "/kobo/words"],
    ["add", "Add", "/kobo/add"],
    ["stats", "Stats", "/kobo/stats"],
    ["settings", "Settings", "/kobo/settings"],
];

const styles = `
html{-webkit-text-size-adjust:100%}
body{margin:0;background:#fff;color:#000;font-family:Georgia,"Times New Roman",serif;font-size:20px;line-height:1.4}
*{-webkit-box-sizing:border-box;box-sizing:border-box}
.page{max-width:920px;margin:0 auto;padding:14px 16px 32px}
.brand{font-size:1.1em;font-weight:bold;letter-spacing:.04em;margin:4px 0 12px}
.brand small{font-weight:normal;font-size:.75em}
a{color:#000}
h1{font-size:1.5em;margin:18px 0 10px}
h2{font-size:1.2em;margin:24px 0 8px}
p{margin:8px 0}
.nav{width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:18px}
.nav td{border:2px solid #000;padding:0;text-align:center}
.nav a{display:block;padding:14px 2px;text-decoration:none;font-weight:bold}
.nav td.active{background:#000}
.nav td.active a{color:#fff}
.notice{border:2px solid #000;padding:12px 14px;margin:12px 0}
.notice.error{border-width:3px;font-weight:bold}
.muted{color:#333;font-size:.85em}
.card{border:3px solid #000;padding:28px 18px;margin:14px 0;text-align:center}
.card .language{font-size:.8em;letter-spacing:.08em;text-transform:uppercase}
.card .word{font-size:2.2em;font-weight:bold;margin:12px 0;word-wrap:break-word}
.card .meaning{font-size:1.4em;margin:16px 0 4px;padding-top:16px;border-top:2px solid #000}
.card .example{font-style:italic;margin-top:14px}
.button,button{display:block;width:100%;min-height:58px;margin:10px 0;padding:14px 10px;border:2px solid #000;border-radius:0;background:#fff;color:#000;font-family:inherit;font-size:1em;font-weight:bold;text-align:center;text-decoration:none;-webkit-appearance:none}
.button.primary,button.primary{background:#000;color:#fff}
.ratings{width:100%;border-collapse:separate;border-spacing:6px 0;table-layout:fixed;margin:0 -6px}
.ratings td{padding:0}
.ratings small{display:block;font-weight:normal;font-size:.75em}
label{display:block;font-weight:bold;margin:14px 0 4px}
input,textarea,select{display:block;width:100%;padding:10px;border:2px solid #000;border-radius:0;background:#fff;color:#000;font-family:inherit;font-size:1em}
input,textarea{-webkit-appearance:none}
textarea{min-height:90px}
.pair{width:100%;border-collapse:separate;border-spacing:8px 0;table-layout:fixed;margin:0 -8px}
.pair td{padding:0;vertical-align:top}
.list{width:100%;border-collapse:collapse}
.list td{border-bottom:2px solid #000;padding:12px 6px;vertical-align:top}
.list .right{text-align:right;white-space:nowrap}
.stats{width:100%;border-collapse:collapse}
.stats td{border:2px solid #000;padding:12px 10px}
.stats td.value{text-align:right;font-weight:bold;font-size:1.2em}
.pager{width:100%;table-layout:fixed;border-collapse:separate;border-spacing:6px 0;margin:10px -6px}
.pager td{padding:0}
@media (min-width:1000px){body{font-size:24px}}
`;

function document(title: string, content: Html) {
    return `<!DOCTYPE html>${html`<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title} · Lexicon Loop</title><style>${new Html(styles)}</style></head><body><div class="page">${content}</div></body></html>`.value}`;
}

const htmlResponse = (body: string, status = 200) =>
    new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });

/** A signed-in page with the Kobo navigation bar. */
export function koboPage({ title, section, body, status }: { title: string; section: KoboSection; body: Html; status?: number }) {
    const nav = html`<table class="nav"><tr>${navItems.map(([id, label, href]) => html`<td class="${id === section ? "active" : ""}"><a href="${href}">${label}</a></td>`)}</tr></table>`;
    return htmlResponse(document(title, html`<div class="brand">Lexicon Loop <small>for Kobo</small></div>${nav}${body}`), status);
}

/** A page without navigation, used for sign-in and fatal errors. */
export function koboBarePage({ title, body, status }: { title: string; body: Html; status?: number }) {
    return htmlResponse(document(title, html`<div class="brand">Lexicon Loop <small>for Kobo</small></div>${body}`), status);
}

export const notice = (message: string | null | undefined, kind: "info" | "error" = "info") =>
    message ? html`<div class="notice ${kind === "error" ? "error" : ""}">${message}</div>` : null;
