import { BookOpenCheck, Languages, Pencil, ShieldCheck } from "lucide-react";
import { TranslationItems } from "@/components/translate/translation-items";
import type { TranslationResult } from "@/lib/api-client";

export function LearningDetails({ result }: { result: TranslationResult }) {
    const usageRows = [
        ["Formal", result.usage?.formal],
        ["Everyday", result.usage?.everyday],
        ["Academic", result.usage?.academic],
    ].filter((row): row is [string, string] => Boolean(row[1]));
    return <div className="translation-learning-grid">
        <section className="surface-panel translation-section translation-wide"><div className="panel-heading"><div><h2>Usage & context</h2><p className="panel-subtitle">How the word changes by situation</p></div><Languages size={17} color="var(--sage)" /></div><div className="usage-list">{usageRows.map(([label, text]) => <div className="usage-row" key={label}><span>{label}</span><p>{text}</p></div>)}</div>{result.usage?.whenToUse && <div className="when-to-use"><strong>When to use it</strong><p>{result.usage.whenToUse}</p></div>}</section>
        <section className="surface-panel translation-section translation-wide"><div className="panel-heading"><div><h2>Common mistakes</h2><p className="panel-subtitle">Errors worth noticing</p></div><ShieldCheck size={17} color="var(--sage)" /></div>{result.commonMistakes.length ? <div className="mistake-list">{result.commonMistakes.map((mistake) => <div className="mistake-row" key={`${mistake.incorrect}-${mistake.correct}`}><div><span className="mistake-label">Avoid</span><strong>{mistake.incorrect}</strong></div><div><span className="mistake-label correct-label">Use</span><strong>{mistake.correct}</strong></div><p>{mistake.explanation}</p></div>)}</div> : <p className="translation-empty">No common mistakes were returned.</p>}</section>
        <section className="surface-panel translation-section translation-wide"><div className="panel-heading"><div><h2>Collocations</h2><p className="panel-subtitle">Words that naturally travel together</p></div><BookOpenCheck size={17} color="var(--sage)" /></div>{result.collocations.length ? <div className="collocation-list">{result.collocations.map((item) => <div className="collocation-row" key={`${item.phrase}-${item.translation}`}><div><strong>{item.phrase}</strong><span>{item.translation}</span></div><p>{item.example}</p></div>)}</div> : <p className="translation-empty">No useful collocations were returned.</p>}</section>
        <section className="surface-panel translation-section translation-wide"><div className="panel-heading"><div><h2>Mini dialogue</h2><p className="panel-subtitle">The word in a natural exchange</p></div><Languages size={17} color="var(--sage)" /></div>{result.dialogue.length ? <div className="dialogue-list">{result.dialogue.map((line, index) => <div className="dialogue-row" key={`${line.speaker}-${index}`}><span>{line.speaker}</span><div><p>{line.source}</p><small>{line.target}</small></div></div>)}</div> : <p className="translation-empty">No dialogue was returned.</p>}</section>
        <section className="surface-panel translation-section translation-wide"><div className="panel-heading"><div><h2>Word forms</h2><p className="panel-subtitle">Useful grammatical relatives</p></div><Pencil size={16} color="var(--sage)" /></div><TranslationItems items={result.wordForms} emptyLabel="No additional grammatical forms were returned." /></section>
    </div>;
}
