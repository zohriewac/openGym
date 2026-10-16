// Markdown-lite for the Coach's words: **bold**, `code`, and "- " / "* " bullet lines.
// Built as React elements (never innerHTML), so model output cannot inject markup.
// shortcut: no headings, links, numbered lists or nesting; add only if the Coach starts to need them.
import { Fragment } from 'react'

const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`)/g
const BULLET = /^\s*[-*•]\s+(.*)$/

const inline = s => s.split(INLINE).map((p, i) =>
  p.startsWith('**') && p.endsWith('**') && p.length > 4 ? <strong key={i}>{p.slice(2, -2)}</strong>
    : p.startsWith('`') && p.endsWith('`') && p.length > 2 ? <code key={i}>{p.slice(1, -1)}</code>
      : <Fragment key={i}>{p}</Fragment>)

/** Group consecutive bullet lines into one list; every other line stays a text line. */
export function parseBlocks(text) {
  const out = []
  for (const line of String(text ?? '').split('\n')) {
    const m = BULLET.exec(line)
    const last = out[out.length - 1]
    if (m && last?.ul) last.ul.push(m[1])
    else if (m) out.push({ ul: [m[1]] })
    else out.push({ line })
  }
  return out
}

export default function CoachText({ text }) {
  const blocks = parseBlocks(text)
  return <>{blocks.map((b, i) => b.ul
    ? <ul key={i}>{b.ul.map((x, j) => <li key={j}>{inline(x)}</li>)}</ul>
    : <Fragment key={i}>{inline(b.line)}{blocks[i + 1]?.line !== undefined ? '\n' : ''}</Fragment>)}</>
}
