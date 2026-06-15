import { describe, expect, it } from 'vitest'

import { crepeBlockEditConfig } from '../../src/editor/crepe-block-edit-config'

describe('crepeBlockEditConfig', () => {
  it('keeps only the first-wave slash commands enabled', () => {
    expect(crepeBlockEditConfig.textGroup?.text?.label).toBe('文本')
    expect(crepeBlockEditConfig.textGroup?.h1?.label).toBe('标题 1')
    expect(crepeBlockEditConfig.textGroup?.h2?.label).toBe('标题 2')
    expect(crepeBlockEditConfig.textGroup?.h3?.label).toBe('标题 3')
    expect(crepeBlockEditConfig.textGroup?.h4?.label).toBe('标题 4')
    expect(crepeBlockEditConfig.textGroup?.h5).toBeNull()
    expect(crepeBlockEditConfig.textGroup?.h6).toBeNull()
    expect(crepeBlockEditConfig.textGroup?.quote?.label).toBe('引用')
    expect(crepeBlockEditConfig.textGroup?.divider?.label).toBe('分割线')

    expect(crepeBlockEditConfig.listGroup?.bulletList?.label).toBe('项目符号列表')
    expect(crepeBlockEditConfig.listGroup?.orderedList?.label).toBe('有序列表')
    expect(crepeBlockEditConfig.listGroup?.taskList?.label).toBe('待办清单')

    expect(crepeBlockEditConfig.advancedGroup?.codeBlock?.label).toBe('代码块')
    expect(crepeBlockEditConfig.advancedGroup?.image).toBeNull()
    expect(crepeBlockEditConfig.advancedGroup?.table).toBeNull()
    expect(crepeBlockEditConfig.advancedGroup?.math).toBeNull()
  })
})
