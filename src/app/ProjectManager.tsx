import { useEffect, useRef, useState } from 'react'
import type { ProjectRegistryRecord } from '../workspace/registry'
import './project-manager.css'

interface ProjectManagerProps {
  open: boolean
  inputOpen: boolean
  projects: ProjectRegistryRecord[]
  activeProjectId: string | null
  busy: boolean
  uncertain: boolean
  status: string | null
  onClose: () => void
  onOpenInput: () => void
  onCloseInput: () => void
  onRegister: (rootPath: string) => Promise<void>
  onRemove: (projectId: string) => Promise<void>
  onReorder: (ids: string[]) => Promise<void>
  onReconcile: () => Promise<void>
}

export function ProjectManager(props: ProjectManagerProps) {
  const [rootPath, setRootPath] = useState('')
  const [removing, setRemoving] = useState<ProjectRegistryRecord | null>(null)
  const [preview, setPreview] = useState<string[] | null>(null)
  const dragging = useRef<string | null>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const disabled = props.busy || props.uncertain
  const visible = props.open || props.inputOpen
  useEffect(() => {
    if (!visible) return
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.focus()
    return () => { if (previous?.isConnected) previous.focus() }
  }, [visible, props.inputOpen])
  const ids = preview ?? props.projects.map(p => p.id)
  function reorder(next: string[]) {
    setPreview(null); dragging.current = null
    if (!disabled && next.some((id, index) => id !== props.projects[index]?.id)) void props.onReorder(next)
  }
  function move(id: string, delta: number) {
    const next = props.projects.map(p => p.id), from = next.indexOf(id), to = from + delta
    if (to < 0 || to >= next.length) return
    next.splice(from, 1); next.splice(to, 0, id); reorder(next)
  }
  function close() {
    if (props.busy) return
    setPreview(null); dragging.current = null; setRemoving(null)
    if (props.inputOpen) props.onCloseInput()
    else props.onClose()
  }
  return <>
    {props.uncertain && !visible ? <div className="project-manager__recovery" role="alert">
      项目列表提交结果尚未确认，草稿保留。
      <button type="button" disabled={props.busy} onClick={() => void props.onReconcile()}>重试确认项目列表</button>
    </div> : null}
    {visible ? <div className="app-dialog__backdrop">
      <div className="app-dialog project-manager" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label={props.inputOpen ? '添加项目' : '管理项目'}
        onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); close() }
          if (event.key !== 'Tab') return
          const items = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]') ?? [])
          if (!items.length) { event.preventDefault(); return }
          const first = items[0], last = items[items.length - 1]
          if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus() }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
        }}>
        <h2>{props.inputOpen ? '添加项目' : '管理项目'}</h2>
        {props.inputOpen ? <form onSubmit={event => { event.preventDefault(); if (!disabled && rootPath.trim()) void props.onRegister(rootPath.trim()) }}>
          <label className="app-dialog__label" htmlFor="project-root-path">项目目录路径</label>
          <input id="project-root-path" className="app-dialog__input" autoFocus value={rootPath} disabled={disabled} placeholder="输入已有项目的完整目录路径" onChange={event => setRootPath(event.target.value)} />
          <p>接入已有目录，项目文件保留在原位置。添加后可打开该项目。</p>
          <div className="app-dialog__actions">
            <button type="button" className="app-dialog__action" disabled={props.busy} onClick={close}>取消</button>
            <button type="submit" className="app-dialog__action" data-tone="primary" disabled={disabled || !rootPath.trim()}>添加并打开</button>
          </div>
        </form> : <>
          <p>拖动手柄或使用上下移调整顺序，操作后自动保存。</p>
          {!props.projects.length ? <p>当前个人配置还没有项目，可以添加已有目录。</p> : null}
          <ul className="project-manager__list" onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPreview(null) }}>
            {ids.map((id, index) => {
              const project = props.projects.find(p => p.id === id)
              if (!project) return null
              return <li className="project-manager__row" key={id} data-project-id={id}
                onDragOver={event => {
                  if (disabled || !dragging.current) return
                  event.preventDefault(); event.dataTransfer.dropEffect = 'move'
                  const next = [...ids], from = next.indexOf(dragging.current)
                  if (from >= 0 && from !== index) { next.splice(from, 1); next.splice(index, 0, dragging.current); setPreview(next) }
                }} onDrop={event => { event.preventDefault(); if (dragging.current) reorder(ids) }}>
                <button type="button" className="project-manager__handle" draggable={!disabled} disabled={disabled} aria-label={`拖动排序 ${project.name}`}
                  onDragStart={event => { dragging.current = id; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', id) }}
                  onDragEnd={() => { dragging.current = null; setPreview(null) }}>⠿</button>
                <div className="project-manager__identity"><strong>{project.name}</strong>{id === props.activeProjectId ? <span>当前项目</span> : null}<small title={project.rootPath}>{project.rootPath}</small></div>
                <button type="button" disabled={disabled || index === 0} aria-label={`${project.name} 上移`} onClick={() => move(id, -1)}>↑</button>
                <button type="button" disabled={disabled || index === ids.length - 1} aria-label={`${project.name} 下移`} onClick={() => move(id, 1)}>↓</button>
                <button type="button" disabled={disabled} aria-label={`移除 ${project.name}`} onClick={() => setRemoving(project)}>移除</button>
              </li>
            })}
          </ul>
          {removing ? <div className="project-manager__confirm" role="group" aria-label="确认移除项目">
            <p>从当前个人配置列表移除“{removing.name}”？项目文件和阅读配置会保留。</p>
            <button type="button" disabled={disabled} onClick={() => { const id = removing.id; setRemoving(null); void props.onRemove(id) }}>确认移除</button>
            <button type="button" disabled={props.busy} onClick={() => setRemoving(null)}>取消移除</button>
          </div> : null}
          <div className="app-dialog__actions">
            <button type="button" className="app-dialog__action" disabled={disabled} onClick={props.onOpenInput}>添加项目</button>
            <button type="button" className="app-dialog__action" disabled={props.busy} onClick={close}>关闭</button>
          </div>
        </>}
        {props.busy ? <p role="status">正在处理项目…</p> : null}
        {props.status ? <p className="project-manager__status" role="status">{props.status}</p> : null}
        {props.uncertain ? <button type="button" disabled={props.busy} onClick={() => void props.onReconcile()}>重试确认项目列表</button> : null}
      </div>
    </div> : null}
  </>
}
