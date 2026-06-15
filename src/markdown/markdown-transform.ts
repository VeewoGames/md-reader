import { markdownTransformConfig } from './markdown-transform-config'

const HYPHEN_DIVIDER_PATTERN = /^[ \t]{0,3}-{3,}[ \t]*$/

export function applyMarkdownTransforms(markdown: string): string {
  let nextMarkdown = markdown

  if (markdownTransformConfig.rules.preferThematicBreakForHyphenDivider.enabled) {
    nextMarkdown = preferThematicBreakForHyphenDivider(nextMarkdown)
  }

  return nextMarkdown
}

function preferThematicBreakForHyphenDivider(markdown: string): string {
  const lineBreak = markdown.includes('\r\n') ? '\r\n' : '\n'
  const lines = markdown.split(/\r?\n/)
  const transformedLines: string[] = []
  let activeFenceMarker: '```' | '~~~' | null = null

  for (let index = 0; index < lines.length; index += 1) {
    const currentLine = lines[index]
    const trimmedCurrentLine = currentLine.trim()
    const fenceMarker = getFenceMarker(trimmedCurrentLine)

    if (fenceMarker) {
      transformedLines.push(currentLine)
      activeFenceMarker =
        activeFenceMarker === fenceMarker
          ? null
          : activeFenceMarker == null
            ? fenceMarker
            : activeFenceMarker
      continue
    }

    if (activeFenceMarker) {
      transformedLines.push(currentLine)
      continue
    }

    const previousLine = transformedLines[transformedLines.length - 1] ?? ''
    const previousLineIsBlank = previousLine.trim().length === 0
    const currentLineIsHyphenDivider = HYPHEN_DIVIDER_PATTERN.test(currentLine)

    if (currentLineIsHyphenDivider && !previousLineIsBlank) {
      transformedLines.push('')
    }

    transformedLines.push(currentLine)

    if (
      currentLineIsHyphenDivider &&
      trimmedCurrentLine.length > 0 &&
      index + 1 < lines.length &&
      lines[index + 1].trim().length > 0
    ) {
      transformedLines.push('')
    }
  }

  return transformedLines.join(lineBreak)
}

function getFenceMarker(trimmedLine: string): '```' | '~~~' | null {
  if (/^```/.test(trimmedLine)) {
    return '```'
  }

  if (/^~~~/.test(trimmedLine)) {
    return '~~~'
  }

  return null
}
