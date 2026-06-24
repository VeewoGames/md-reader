export interface MarkdownTransformRuleConfig {
  id: string
  enabled: boolean
  description: string
}

export interface MarkdownTransformConfig {
  rules: {
    preferThematicBreakForHyphenDivider: MarkdownTransformRuleConfig
    normalizeMalformedNotionExportArtifacts: MarkdownTransformRuleConfig
    unwrapMalformedSyncedBlockPseudoCodeFences: MarkdownTransformRuleConfig
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
    normalizeMalformedNotionExportArtifacts: {
      id: 'normalize-malformed-notion-export-artifacts',
      enabled: true,
      description:
        '清理 Notion 异常导出遗留的转义 page_id 注释和紧随其后的重复一级标题，避免文档开头出现缺失或重复内容。',
    },
    unwrapMalformedSyncedBlockPseudoCodeFences: {
      id: 'unwrap-malformed-synced-block-pseudo-code-fences',
      enabled: true,
      description:
        '将 synced_block 异常导出成无语言代码围栏、但内部仅包含 Markdown 标签文本的伪代码块还原为普通 Markdown 段落。',
    },
    hideSyncedBlockWrappers: {
      id: 'hide-synced-block-wrappers',
      enabled: true,
      description: '默认隐藏独占一行的 <synced_block url="..."> 与 </synced_block> 包装标签。',
    },
  },
}
