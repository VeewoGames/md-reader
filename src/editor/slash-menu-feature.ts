import type { Ctx } from '@milkdown/ctx'
import type { Editor } from '@milkdown/core'
import { commandsCtx, editorViewCtx } from '@milkdown/kit/core'
import {
  addBlockTypeCommand,
  blockquoteSchema,
  bulletListSchema,
  codeBlockSchema,
  headingSchema,
  hrSchema,
  listItemSchema,
  orderedListSchema,
  paragraphSchema,
  setBlockTypeCommand,
  wrapInBlockTypeCommand,
} from '@milkdown/kit/preset/commonmark'
import { SlashProvider, slashFactory } from '@milkdown/kit/plugin/slash'
import type { EditorView } from '@milkdown/kit/prose/view'
import {
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Pilcrow,
  Quote,
  type LucideIcon,
} from 'lucide-react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

type SlashMenuCommand = {
  aliases: string[]
  group: 'text' | 'list' | 'advanced'
  icon: LucideIcon
  key: string
  label: string
  run: (ctx: Ctx) => void
}

export type SlashTriggerMatch = {
  cleanupFrom: number
  from: number
  query: string
  to: number
}

const slashMenu = slashFactory('MD_READER_SLASH_MENU')

const GROUP_LABELS = {
  advanced: '高级',
  list: '列表',
  text: '基础区块',
} as const

function createMenuIconSvg(icon: LucideIcon): string {
  return renderToStaticMarkup(
    createElement(icon, {
      size: 18,
      strokeWidth: 2,
      absoluteStrokeWidth: true,
      'aria-hidden': 'true',
    }),
  )
}

function buildSlashCommands(): SlashMenuCommand[] {
  return [
    {
      key: 'text',
      group: 'text',
      icon: Pilcrow,
      label: '文本',
      aliases: ['text', 'paragraph', 'p', '正文', '文本'],
      run: (ctx) => {
        const commands = ctx.get(commandsCtx)
        commands.call(setBlockTypeCommand.key, {
          nodeType: paragraphSchema.type(ctx),
        })
      },
    },
    {
      key: 'h1',
      group: 'text',
      icon: Heading1,
      label: '标题 1',
      aliases: ['h1', '#', 'title1', 'heading1', '标题1', '标题 1'],
      run: (ctx) => {
        const commands = ctx.get(commandsCtx)
        commands.call(setBlockTypeCommand.key, {
          nodeType: headingSchema.type(ctx),
          attrs: { level: 1 },
        })
      },
    },
    {
      key: 'h2',
      group: 'text',
      icon: Heading2,
      label: '标题 2',
      aliases: ['h2', '##', 'title2', 'heading2', '标题2', '标题 2'],
      run: (ctx) => {
        const commands = ctx.get(commandsCtx)
        commands.call(setBlockTypeCommand.key, {
          nodeType: headingSchema.type(ctx),
          attrs: { level: 2 },
        })
      },
    },
    {
      key: 'h3',
      group: 'text',
      icon: Heading3,
      label: '标题 3',
      aliases: ['h3', '###', 'title3', 'heading3', '标题3', '标题 3'],
      run: (ctx) => {
        const commands = ctx.get(commandsCtx)
        commands.call(setBlockTypeCommand.key, {
          nodeType: headingSchema.type(ctx),
          attrs: { level: 3 },
        })
      },
    },
    {
      key: 'h4',
      group: 'text',
      icon: Heading4,
      label: '标题 4',
      aliases: ['h4', '####', 'title4', 'heading4', '标题4', '标题 4'],
      run: (ctx) => {
        const commands = ctx.get(commandsCtx)
        commands.call(setBlockTypeCommand.key, {
          nodeType: headingSchema.type(ctx),
          attrs: { level: 4 },
        })
      },
    },
    {
      key: 'quote',
      group: 'text',
      icon: Quote,
      label: '引用',
      aliases: ['quote', 'blockquote', '>', '引用'],
      run: (ctx) => {
        const commands = ctx.get(commandsCtx)
        commands.call(wrapInBlockTypeCommand.key, {
          nodeType: blockquoteSchema.type(ctx),
        })
      },
    },
    {
      key: 'divider',
      group: 'text',
      icon: Minus,
      label: '分割线',
      aliases: ['divider', 'hr', '---', '分割线'],
      run: (ctx) => {
        const commands = ctx.get(commandsCtx)
        commands.call(addBlockTypeCommand.key, {
          nodeType: hrSchema.type(ctx),
        })
      },
    },
    {
      key: 'bullet-list',
      group: 'list',
      icon: List,
      label: '项目符号列表',
      aliases: ['ul', 'bullet', 'list', '-', '*', '项目符号列表', '无序列表'],
      run: (ctx) => {
        const commands = ctx.get(commandsCtx)
        commands.call(wrapInBlockTypeCommand.key, {
          nodeType: bulletListSchema.type(ctx),
        })
      },
    },
    {
      key: 'ordered-list',
      group: 'list',
      icon: ListOrdered,
      label: '有序列表',
      aliases: ['ol', 'ordered', 'numbered', '1.', '有序列表'],
      run: (ctx) => {
        const commands = ctx.get(commandsCtx)
        commands.call(wrapInBlockTypeCommand.key, {
          nodeType: orderedListSchema.type(ctx),
        })
      },
    },
    {
      key: 'task-list',
      group: 'list',
      icon: ListTodo,
      label: '待办清单',
      aliases: ['todo', 'task', 'checkbox', '[]', '待办', '待办清单'],
      run: (ctx) => {
        const commands = ctx.get(commandsCtx)
        commands.call(wrapInBlockTypeCommand.key, {
          nodeType: listItemSchema.type(ctx),
          attrs: { checked: false },
        })
      },
    },
    {
      key: 'code',
      group: 'advanced',
      icon: Code2,
      label: '代码块',
      aliases: ['code', '```', '代码', '代码块'],
      run: (ctx) => {
        const commands = ctx.get(commandsCtx)
        commands.call(setBlockTypeCommand.key, {
          nodeType: codeBlockSchema.type(ctx),
        })
      },
    },
  ]
}

const SLASH_COMMANDS = buildSlashCommands()

export function matchesSlashQuery(query: string, aliases: readonly string[]): boolean {
  const normalizedQuery = query.trim().toLowerCase()

  if (normalizedQuery.length === 0) {
    return true
  }

  return aliases.some((alias) => alias.toLowerCase().includes(normalizedQuery))
}

export function findSlashTriggerMatch(view: EditorView): SlashTriggerMatch | null {
  const { selection } = view.state

  if (
    !view.editable ||
    !view.hasFocus() ||
    selection == null ||
    !('empty' in selection) ||
    !('from' in selection) ||
    !('$from' in selection) ||
    !selection.empty
  ) {
    return null
  }

  const { $from } = selection
  const parentType = $from.parent.type.name

  if (!['paragraph', 'heading'].includes(parentType)) {
    return null
  }

  const textBeforeCursor = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc')

  if (textBeforeCursor.length === 0) {
    return null
  }

  for (let index = textBeforeCursor.length - 1; index >= 0; index -= 1) {
    if (textBeforeCursor[index] !== '/') {
      continue
    }

    if (index > 0 && [':', '/'].includes(textBeforeCursor[index - 1])) {
      continue
    }

    const query = textBeforeCursor.slice(index + 1)
    const tokenStart = Math.max(textBeforeCursor.lastIndexOf(' ', index - 1), 0)
    const activeToken = textBeforeCursor.slice(tokenStart === 0 ? 0 : tokenStart + 1)

    if (/^(https?|file):\/\/\S*$/i.test(activeToken)) {
      continue
    }

    if (/\s/.test(query)) {
      return null
    }

    const start = $from.start() + index
    const cleanupFrom =
      index > 0 && /\s/.test(textBeforeCursor[index - 1]) ? start - 1 : start

    return {
      cleanupFrom,
      from: start,
      query,
      to: selection.from,
    }
  }

  return null
}

function getFilteredCommands(query: string): SlashMenuCommand[] {
  return SLASH_COMMANDS.filter((command) => matchesSlashQuery(query, [command.label, ...command.aliases]))
}

function removeSlashQuery(view: EditorView, match: SlashTriggerMatch) {
  const transaction = view.state.tr.delete(match.cleanupFrom, match.to)
  view.dispatch(transaction)
}

class SlashMenuView {
  private readonly ctx: Ctx
  private readonly content: HTMLDivElement
  private readonly groupTabs: HTMLUListElement
  private readonly menuGroups: HTMLDivElement
  private readonly provider: SlashProvider
  private currentCommands: SlashMenuCommand[] = []
  private currentMatch: SlashTriggerMatch | null = null
  private hoverIndex = 0

  constructor(ctx: Ctx, view: EditorView) {
    this.ctx = ctx
    this.content = document.createElement('div')
    this.content.classList.add('milkdown-slash-menu')
    this.content.dataset.show = 'false'

    const tabGroup = document.createElement('nav')
    tabGroup.className = 'tab-group'
    this.groupTabs = document.createElement('ul')
    tabGroup.appendChild(this.groupTabs)

    this.menuGroups = document.createElement('div')
    this.menuGroups.className = 'menu-groups'

    this.content.append(tabGroup, this.menuGroups)
    this.content.addEventListener('pointerdown', (event) => event.preventDefault())

    this.provider = new SlashProvider({
      content: this.content,
      debounce: 20,
      shouldShow: (nextView) => {
        const match = findSlashTriggerMatch(nextView)

        if (!match) {
          this.currentMatch = null
          this.currentCommands = []
          return false
        }

        const filtered = getFilteredCommands(match.query)

        if (filtered.length === 0) {
          this.currentMatch = match
          this.currentCommands = []
          return false
        }

        this.currentMatch = match
        this.currentCommands = filtered
        this.hoverIndex = Math.min(this.hoverIndex, filtered.length - 1)
        this.render()
        return true
      },
      offset: 10,
    })

    this.provider.onShow = () => {
      this.content.dataset.show = 'true'
      window.addEventListener('keydown', this.handleKeydown, { capture: true })
    }

    this.provider.onHide = () => {
      this.content.dataset.show = 'false'
      window.removeEventListener('keydown', this.handleKeydown, { capture: true })
    }

    this.provider.update(view)
  }

  update(view: EditorView) {
    this.provider.update(view)
  }

  destroy() {
    window.removeEventListener('keydown', this.handleKeydown, { capture: true })
    this.provider.destroy()
    this.content.remove()
  }

  private readonly handleKeydown = (event: KeyboardEvent) => {
    if (this.content.dataset.show !== 'true' || this.currentCommands.length === 0) {
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      this.provider.hide()
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      this.hoverIndex = Math.min(this.hoverIndex + 1, this.currentCommands.length - 1)
      this.render()
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      this.hoverIndex = Math.max(this.hoverIndex - 1, 0)
      this.render()
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      this.runCommand(this.currentCommands[this.hoverIndex])
    }
  }

  private runCommand(command: SlashMenuCommand | undefined) {
    if (!command || !this.currentMatch) {
      return
    }

    const view = this.ctx.get(editorViewCtx) as EditorView

    if (!view.hasFocus()) {
      view.focus()
    }

    removeSlashQuery(view, this.currentMatch)
    command.run(this.ctx)
    this.provider.hide()
  }

  private render() {
    const grouped = (['text', 'list', 'advanced'] as const)
      .map((groupKey) => ({
        key: groupKey,
        label: GROUP_LABELS[groupKey],
        items: this.currentCommands.filter((command) => command.group === groupKey),
      }))
      .filter((group) => group.items.length > 0)

    this.groupTabs.replaceChildren()
    this.menuGroups.replaceChildren()

    let runningIndex = 0

    for (const group of grouped) {
      const tab = document.createElement('li')
      tab.textContent = group.label
      tab.className =
        this.hoverIndex >= runningIndex && this.hoverIndex < runningIndex + group.items.length
          ? 'selected'
          : ''
      this.groupTabs.appendChild(tab)

      const groupElement = document.createElement('div')
      groupElement.className = 'menu-group'

      const heading = document.createElement('h6')
      heading.textContent = group.label
      groupElement.appendChild(heading)

      const list = document.createElement('ul')

      for (const command of group.items) {
        const itemIndex = runningIndex
        const item = document.createElement('li')
        item.dataset.index = String(itemIndex)
        item.className = this.hoverIndex === itemIndex ? 'hover' : ''

        const icon = document.createElement('span')
        icon.className = 'slash-menu__icon'
        icon.innerHTML = createMenuIconSvg(command.icon)

        const label = document.createElement('span')
        label.className = 'slash-menu__label'
        label.textContent = command.label

        item.append(icon, label)
        item.addEventListener('pointerenter', () => {
          this.hoverIndex = itemIndex
          this.render()
        })
        item.addEventListener('pointerup', () => {
          this.runCommand(command)
        })

        list.appendChild(item)
        runningIndex += 1
      }

      groupElement.appendChild(list)
      this.menuGroups.appendChild(groupElement)
    }
  }
}

export function installSlashMenuFeature(editor: Editor) {
  editor.config((ctx) => {
    ctx.set(slashMenu.key, {
      view: (view: EditorView) => new SlashMenuView(ctx, view),
    })
  })
  editor.use(slashMenu)
}
