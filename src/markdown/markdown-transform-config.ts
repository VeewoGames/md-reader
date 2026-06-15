export interface MarkdownTransformRuleConfig {
  id: string
  enabled: boolean
  description: string
}

export interface MarkdownTransformConfig {
  rules: {
    preferThematicBreakForHyphenDivider: MarkdownTransformRuleConfig
    hideSyncedBlockWrappers: MarkdownTransformRuleConfig
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
    hideSyncedBlockWrappers: {
      id: 'hide-synced-block-wrappers',
      enabled: true,
      description: '默认隐藏独占一行的 <synced_block url="..."> 与 </synced_block> 包装标签。',
    },
  },
}
