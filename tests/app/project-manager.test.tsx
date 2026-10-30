import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { ProjectManager } from '../../src/app/ProjectManager'

const projects = ['a', 'b'].map(id => ({ id, name: id.toUpperCase(), rootPath: `/${id}`, contentRoots: ['.'], permissionState: 'granted' as const }))
function props() { return { open: true, inputOpen: false, projects, activeProjectId: 'a', busy: false, uncertain: false, status: null, onClose: vi.fn(), onOpenInput: vi.fn(), onCloseInput: vi.fn(), onRegister: vi.fn(), onRemove: vi.fn(), onReorder: vi.fn(), onReconcile: vi.fn() } }
it('previews a drag and commits one order on drop, with drag-end leaving no extra command', () => {
  const input = props(); render(<ProjectManager {...input} />)
  const transfer = { effectAllowed: '', dropEffect: '', setData: vi.fn() }
  const handle = screen.getByRole('button', { name: '拖动排序 A' })
  fireEvent.dragStart(handle, { dataTransfer: transfer })
  fireEvent.dragOver(screen.getByText('B').closest('li')!, { dataTransfer: transfer })
  fireEvent.drop(screen.getByText('B').closest('li')!, { dataTransfer: transfer })
  fireEvent.dragEnd(handle, { dataTransfer: transfer })
  expect(input.onReorder).toHaveBeenCalledExactlyOnceWith(['b', 'a'])
})
it('cancels a drag without submitting and disables mutation during unknown outcome', () => {
  const input = props(), view = render(<ProjectManager {...input} />)
  const handle = screen.getByRole('button', { name: '拖动排序 A' })
  fireEvent.dragStart(handle, { dataTransfer: { setData: vi.fn() } })
  fireEvent.dragEnd(handle)
  expect(input.onReorder).not.toHaveBeenCalled()
  view.rerender(<ProjectManager {...input} uncertain />)
  expect(screen.getByRole('button', { name: 'A 下移' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '重试确认项目列表' })).toBeEnabled()
})
it('requires removal confirmation and retains path input on failure', async () => {
  const user = userEvent.setup(), input = props(), view = render(<ProjectManager {...input} />)
  await user.click(screen.getByRole('button', { name: '移除 A' }))
  expect(input.onRemove).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '取消移除' }))
  expect(input.onRemove).not.toHaveBeenCalled()
  view.rerender(<ProjectManager {...input} inputOpen status="目录不可用" />)
  await user.type(screen.getByRole('textbox', { name: '项目目录路径' }), '/missing')
  await user.click(screen.getByRole('button', { name: '添加并打开' }))
  expect(input.onRegister).toHaveBeenCalledWith('/missing')
  expect(screen.getByRole('textbox', { name: '项目目录路径' })).toHaveValue('/missing')
})
