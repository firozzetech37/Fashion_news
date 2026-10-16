import { Fragment, type ReactNode } from "react"

/** Renders the assistant's light formatting (paragraphs, "- " bullets, **bold**) without injecting HTML. */
export function AnswerText({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let bullets: string[] = []
  const flush = () => {
    if (bullets.length) {
      blocks.push(<ul key={`ul-${blocks.length}`} className="list-disc space-y-1.5 pl-5">{bullets.map((b, i) => <li key={i}>{inline(b)}</li>)}</ul>)
      bullets = []
    }
  }
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (/^[-*•]\s+/.test(line)) bullets.push(line.replace(/^[-*•]\s+/, ""))
    else {
      flush()
      if (line) blocks.push(<p key={`p-${blocks.length}`}>{inline(line)}</p>)
    }
  }
  flush()
  return <div className="space-y-3 leading-relaxed">{blocks}</div>
}

function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
      : <Fragment key={i}>{part}</Fragment>,
  )
}
