export interface MarkdownTransformRuleConfig {
  id: string
  enabled: boolean
  description: string
}

export interface MarkdownTransformConfig {
  rules: {
    preferThematicBreakForHyphenDivider: MarkdownTransformRuleConfig
  }
}

export const markdownTransformConfig: MarkdownTransformConfig = {
  rules: {
    preferThematicBreakForHyphenDivider: {
      id: 'prefer-thematic-break-for-hyphen-divider',
      enabled: true,
      description:
        '当 --- 出现在普通段落后时，优先把它解释为分割线，而不是 Setext 二级标题下划线。',
    },
  },
}
