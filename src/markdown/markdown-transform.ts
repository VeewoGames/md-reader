import { markdownTransformConfig } from './markdown-transform-config'

const HYPHEN_DIVIDER_PATTERN = /^[ \t]{0,3}-{3,}[ \t]*$/
const SYNCED_BLOCK_OPEN_PATTERN = /[ \t]*<synced_block\s+url="[^"]+">[ \t]*/gi
const SYNCED_BLOCK_CLOSE_PATTERN = /[ \t]*<\/synced_block>[ \t]*/gi
const SYNCED_BLOCK_ARTIFACT_LINE_PATTERN = /^[ \t]*\\?<\/?synced\\?_block\b.*$/i

export function applyMarkdownTransforms(markdown: string): string {
  let nextMarkdown = markdown

  if (markdownTransformConfig.rules.preferThematicBreakForHyphenDivider.enabled) {
    nextMarkdown = preferThematicBreakForHyphenDivider(nextMarkdown)
  }

  if (markdownTransformConfig.rules.hideSyncedBlockWrappers.enabled) {
    nextMarkdown = hideSyncedBlockWrappers(nextMarkdown)
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

function hideSyncedBlockWrappers(markdown: string): string {
  const lineBreak = markdown.includes('\r\n') ? '\r\n' : '\n'
  const lines = markdown.split(/\r?\n/)
  const transformedLines: string[] = []
  let activeFenceMarker: '```' | '~~~' | null = null

  for (const currentLine of lines) {
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

    if (!activeFenceMarker) {
      if (SYNCED_BLOCK_ARTIFACT_LINE_PATTERN.test(trimmedCurrentLine)) {
        continue
      }

      const transformedLine = currentLine
        .replace(SYNCED_BLOCK_CLOSE_PATTERN, '')
        .replace(SYNCED_BLOCK_OPEN_PATTERN, '')

      if (transformedLine.trim().length === 0 && currentLine.trim().length > 0) {
        continue
      }

      transformedLines.push(transformedLine)
      continue
    }

    transformedLines.push(currentLine)
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
