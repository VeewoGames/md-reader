import { markdownTransformConfig } from './markdown-transform-config'

const HYPHEN_DIVIDER_PATTERN = /^[ \t]{0,3}-{3,}[ \t]*$/
const ESCAPED_PAGE_METADATA_PATTERN = /^\\<!--\s*page\\?_id:\s*[\da-f-]+\s*-->$/i
const SYNCED_BLOCK_OPEN_PATTERN = /[ \t]*<synced_block\s+url="[^"]+">[ \t]*/gi
const SYNCED_BLOCK_CLOSE_PATTERN = /[ \t]*<\/synced_block>[ \t]*/gi
const SYNCED_BLOCK_ARTIFACT_LINE_PATTERN = /^[ \t]*\\?<\/?synced\\?_block\b.*$/i
const MARKDOWN_HEADING_PATTERN = /^(#{1,6})[ \t]+(.+?)\s*$/

export function applyMarkdownTransforms(markdown: string): string {
  let nextMarkdown = markdown

  if (markdownTransformConfig.rules.preferThematicBreakForHyphenDivider.enabled) {
    nextMarkdown = preferThematicBreakForHyphenDivider(nextMarkdown)
  }

  if (markdownTransformConfig.rules.normalizeMalformedNotionExportArtifacts.enabled) {
    nextMarkdown = normalizeMalformedNotionExportArtifacts(nextMarkdown)
  }

  if (markdownTransformConfig.rules.unwrapMalformedSyncedBlockPseudoCodeFences.enabled) {
    nextMarkdown = unwrapMalformedSyncedBlockPseudoCodeFences(nextMarkdown)
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

function normalizeMalformedNotionExportArtifacts(markdown: string): string {
  const lineBreak = markdown.includes('\r\n') ? '\r\n' : '\n'
  const lines = markdown.split(/\r?\n/)
  const transformedLines: string[] = []
  let activeFenceMarker: '```' | '~~~' | null = null
  let leadingHeadingSignature: string | null = null
  let pendingDuplicateHeadingSignature: string | null = null
  let suppressBlankLinesAfterLeadingArtifact = false

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

    if (activeFenceMarker) {
      transformedLines.push(currentLine)
      continue
    }

    if (ESCAPED_PAGE_METADATA_PATTERN.test(trimmedCurrentLine)) {
      pendingDuplicateHeadingSignature = leadingHeadingSignature
      suppressBlankLinesAfterLeadingArtifact = true
      continue
    }

    if (pendingDuplicateHeadingSignature) {
      if (trimmedCurrentLine.length === 0) {
        continue
      }

      const currentHeadingSignature = getHeadingSignature(trimmedCurrentLine)

      if (currentHeadingSignature === pendingDuplicateHeadingSignature) {
        pendingDuplicateHeadingSignature = null
        suppressBlankLinesAfterLeadingArtifact = true
        continue
      }

      pendingDuplicateHeadingSignature = null
    }

    if (suppressBlankLinesAfterLeadingArtifact && trimmedCurrentLine.length === 0) {
      continue
    }

    suppressBlankLinesAfterLeadingArtifact = false

    if (!leadingHeadingSignature) {
      leadingHeadingSignature = getHeadingSignature(trimmedCurrentLine)
    }

    transformedLines.push(currentLine)
  }

  return transformedLines.join(lineBreak)
}

function unwrapMalformedSyncedBlockPseudoCodeFences(markdown: string): string {
  const lineBreak = markdown.includes('\r\n') ? '\r\n' : '\n'
  const lines = markdown.split(/\r?\n/)
  const transformedLines: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const currentLine = lines[index]
    const trimmedCurrentLine = currentLine.trim()

    if (trimmedCurrentLine !== '```') {
      transformedLines.push(currentLine)
      continue
    }

    const closingFenceIndex = findClosingExactCodeFence(lines, index + 1)

    if (closingFenceIndex < 0) {
      transformedLines.push(currentLine)
      continue
    }

    const fencedBlockLines = lines.slice(index + 1, closingFenceIndex)

    if (!isMalformedSyncedBlockPseudoCodeFence(fencedBlockLines)) {
      transformedLines.push(currentLine)
      continue
    }

    appendPseudoMarkdownFenceBody(transformedLines, fencedBlockLines)
    index = closingFenceIndex
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

function getHeadingSignature(trimmedLine: string): string | null {
  const match = trimmedLine.match(MARKDOWN_HEADING_PATTERN)

  if (!match) {
    return null
  }

  const [, marker, headingText] = match
  return `${marker.length}:${headingText.trim()}`
}

function findClosingExactCodeFence(lines: string[], startIndex: number): number {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (lines[index].trim() === '```') {
      return index
    }
  }

  return -1
}

function isMalformedSyncedBlockPseudoCodeFence(lines: string[]): boolean {
  const nonBlankLines = lines.map((line) => line.trim()).filter((line) => line.length > 0)

  if (nonBlankLines.length < 2) {
    return false
  }

  return nonBlankLines.every((line) => /^\*\*.+\*\*(?:[（(:：]|$)/.test(line))
}

function appendPseudoMarkdownFenceBody(target: string[], lines: string[]) {
  const compactLines = lines.map((line) => line.trim()).filter((line) => line.length > 0)

  for (let index = 0; index < compactLines.length; index += 1) {
    if (target.length > 0 && target[target.length - 1].trim().length > 0) {
      target.push('')
    }

    target.push(compactLines[index])
  }
}
