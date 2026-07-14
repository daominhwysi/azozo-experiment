import React, { Fragment } from "react"
import type { Question } from "@/types/exam"

export interface SectionGroup {
  sectionText: string
  sectionTitle: string
  questions: { question: Question; globalIndex: number }[]
}

export function getSectionTitle(
  sectionText: string | undefined | null,
  index: number
): string {
  if (!sectionText) return `Section ${index}`
  const match =
    sectionText.match(/PART\s+[I|V|X|\d]+/i) ||
    sectionText.match(/SECTION\s+[I|V|X|\d]+/i)
  if (match) {
    return match[0].toUpperCase()
  }
  const firstLine = sectionText
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0)
  if (
    firstLine &&
    firstLine.length < 20 &&
    !/directions|in the|read the/i.test(firstLine)
  ) {
    return firstLine.toUpperCase()
  }
  return `Section ${index}`
}

export function groupBySection(questions: Question[]): SectionGroup[] {
  const groups: SectionGroup[] = []
  questions.forEach((q, idx) => {
    const secText = q.section || ""
    const lastGroup = groups[groups.length - 1]

    if (lastGroup && lastGroup.sectionText === secText) {
      lastGroup.questions.push({ question: q, globalIndex: idx })
    } else {
      groups.push({
        sectionText: secText,
        sectionTitle: "",
        questions: [{ question: q, globalIndex: idx }],
      })
    }
  })

  groups.forEach((group, idx) => {
    group.sectionTitle = getSectionTitle(group.sectionText, idx + 1)
  })

  return groups
}

export function stripMarkdown(text: string | undefined | null): string {
  if (!text) return ""
  return (
    text
      // Remove headers
      .replace(/^#+\s+/gm, "")
      // Remove bold/italic formatting
      .replace(/(\*\*|__)(.*?)\1/g, "$2")
      .replace(/(\*|_)(.*?)\1/g, "$2")
      // Remove inline code block formatting
      .replace(/`([^`]+)`/g, "$1")
      // Remove links
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      // Remove blockquotes
      .replace(/^\s*>\s+/gm, "")
      // Remove list markers
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/^\s*\d+\.\s+/gm, "")
      .trim()
  )
}

export function renderTextWithGaps(
  text: string | undefined | null
): React.ReactNode {
  if (!text) return ""

  // Match 3 or more underscores, hyphens, or periods
  const gapRegex = /(_{3,}|-{3,}|\.{3,})/g

  let placeholderIndex = 0
  const placeholders: { [key: string]: React.ReactNode } = {}

  const textWithPlaceholders = text.replace(gapRegex, () => {
    const key = `{{GAP_${placeholderIndex++}}}`
    placeholders[key] = (
      <span
        key={key}
        className="mx-1.5 inline-block h-3.5 min-w-[3.5rem] border-b-2 border-foreground/60 bg-primary/5 align-middle"
        title="Gap"
      />
    )
    return key
  })

  const cleanText = stripMarkdown(textWithPlaceholders)
  const parts = cleanText.split(/(\{\{GAP_\d+\}\})/g)

  return (
    <>
      {parts.map((part, pIdx) => {
        if (part.startsWith("{{GAP_") && part.endsWith("}}")) {
          return placeholders[part] || part
        }

        const uParts = part.split(/(<u>.*?<\/u>)/gi)
        return (
          <Fragment key={pIdx}>
            {uParts.map((subPart, sIdx) => {
              const match = subPart.match(/<u>(.*?)<\/u>/i)
              if (match) {
                return (
                  <u key={sIdx} className="underline">
                    {match[1]}
                  </u>
                )
              }
              return subPart
            })}
          </Fragment>
        )
      })}
    </>
  )
}

export function renderMarkdownTablesOnly(
  text: string,
  partIndex: number
): React.ReactNode {
  if (!text) return null

  const lines = text.split("\n")
  const elements: React.ReactNode[] = []
  let currentTableRows: string[][] = []
  let isInsideTable = false

  const flushTable = (key: string | number) => {
    if (currentTableRows.length === 0) return

    const isSeparatorRow = (row: string[]) => {
      const joinStr = row.join("").trim()
      return /^[|\-:\s]+$/.test(joinStr) && joinStr.includes("-")
    }

    const hasSeparator = currentTableRows.some(isSeparatorRow)
    const cleanedRows = currentTableRows.filter((row) => !isSeparatorRow(row))

    if (cleanedRows.length > 0) {
      const headerCandidate = cleanedRows[0]
      const isHeaderEmpty = headerCandidate.every((cell) => !cell.trim())

      let headers: string[]
      let bodyRows: string[][]

      if (hasSeparator) {
        if (isHeaderEmpty) {
          headers = []
          bodyRows = cleanedRows.slice(1)
        } else {
          headers = headerCandidate
          bodyRows = cleanedRows.slice(1)
        }
      } else {
        headers = []
        bodyRows = cleanedRows
      }

      elements.push(
        <div
          key={`table-${partIndex}-${key}`}
          className="my-3 overflow-x-auto rounded-lg border border-border/80"
        >
          <table className="min-w-full divide-y divide-border text-left text-xs">
            {headers.length > 0 && (
              <thead className="bg-muted/40 font-semibold text-foreground">
                <tr>
                  {headers.map((cell, idx) => (
                    <th
                      key={idx}
                      className="border-r border-border/40 px-3 py-2 last:border-r-0"
                    >
                      {renderTextWithGaps(cell.trim())}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody className="divide-y divide-border/30 bg-card">
              {bodyRows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-muted/20">
                  {row.map((cell, cIdx) => (
                    <td
                      key={cIdx}
                      className="border-r border-border/40 px-3 py-2 text-muted-foreground last:border-r-0"
                    >
                      {renderTextWithGaps(cell.trim())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
    currentTableRows = []
    isInsideTable = false
  }

  let textAccumulator: string[] = []
  const flushText = (key: string | number) => {
    if (textAccumulator.length > 0) {
      elements.push(
        <span
          key={`text-${partIndex}-${key}`}
          className="block whitespace-pre-wrap"
        >
          {renderTextWithGaps(textAccumulator.join("\n"))}
        </span>
      )
      textAccumulator = []
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    const isTableRow = line.startsWith("|") && line.endsWith("|")
    const isDivider = /^[-*_]{3,}\s*$/.test(line)

    if (isTableRow) {
      if (!isInsideTable) {
        flushText(i)
        isInsideTable = true
      }
      const cols = line
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim())
      currentTableRows.push(cols)
    } else if (isDivider) {
      if (isInsideTable) {
        flushTable(i)
      } else {
        flushText(i)
      }
      elements.push(
        <hr
          key={`divider-${partIndex}-${i}`}
          className="my-4 border-t border-border/80"
        />
      )
    } else {
      if (isInsideTable) {
        flushTable(i)
      }
      textAccumulator.push(lines[i])
    }
  }

  if (isInsideTable) {
    flushTable("end")
  } else {
    flushText("end")
  }

  return <Fragment key={partIndex}>{elements}</Fragment>
}

export function renderTextWithTables(
  text: string | undefined | null
): React.ReactNode {
  if (!text) return ""

  const parts = text.split(/(<table[\s\S]*?<\/table>)/i)
  return (
    <>
      {parts.map((part, index) => {
        if (part.trim().toLowerCase().startsWith("<table")) {
          return (
            <div
              key={`html-table-${index}`}
              className="my-3 overflow-x-auto rounded-lg border border-border/80 text-left text-xs text-foreground/80 [&_table]:min-w-full [&_table]:divide-y [&_table]:divide-border [&_tbody]:divide-y [&_tbody]:divide-border/30 [&_tbody]:bg-card [&_td]:border-r [&_td]:border-border/40 [&_td]:px-3 [&_td]:py-2 [&_td]:last:border-r-0 [&_th]:border-r [&_th]:border-border/40 [&_th]:bg-muted/40 [&_th]:px-3 [&_th]:py-2 [&_th]:font-semibold [&_th]:text-foreground [&_th]:last:border-r-0 [&_tr]:hover:bg-muted/20"
              dangerouslySetInnerHTML={{ __html: part }}
            />
          )
        } else {
          return renderMarkdownTablesOnly(part, index)
        }
      })}
    </>
  )
}
