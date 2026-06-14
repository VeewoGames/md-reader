export function splitLeadingHtmlComments(markdown: string): {
  preservedPrefix: string
  editorValue: string
} {
  const match = markdown.match(/^(?:(?:<!--[^\n]*?-->\r?\n?)+)/)

  if (!match) {
    return {
      preservedPrefix: '',
      editorValue: markdown,
    }
  }

  return {
    preservedPrefix: match[0],
    editorValue: markdown.slice(match[0].length),
  }
}
