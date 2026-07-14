import { renderTextWithTables } from "@/lib/markdown"

export function StimulusBlock({ text }: { text: string }) {
  return (
    <div className="my-4 rounded-lg border border-border/60 bg-card p-5 font-serif text-sm leading-relaxed text-foreground/90 md:text-base">
      {renderTextWithTables(text)}
    </div>
  )
}
