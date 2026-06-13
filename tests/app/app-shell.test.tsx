import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import App from '../../src/App'
import { AppShell } from '../../src/app/AppShell'

describe('App', () => {
  it('renders an empty workspace state before any project is connected', () => {
    render(<App />)

    expect(screen.getByRole('banner')).toHaveTextContent('md-reader')
    expect(screen.getByRole('button', { name: '接入项目' })).toBeInTheDocument()
    expect(screen.getAllByText('还没有接入任何 Markdown 项目').length).toBeGreaterThan(0)
  })
})

describe('AppShell', () => {
  it('renders the active project, profile and file tree nodes', () => {
    render(
      <AppShell
        projects={[
          {
            id: 'notes',
            name: 'Notes',
            rootHandleKey: 'handle:notes',
            contentRoots: ['docs'],
            permissionState: 'granted',
          },
        ]}
        activeProjectId="notes"
        profileIds={['default', 'writer']}
        activeProfileId="writer"
        mode="read"
        fileTree={[
          {
            id: 'docs',
            kind: 'directory',
            name: 'docs',
            path: 'docs',
            children: [
              {
                id: 'docs/README.md',
                kind: 'file',
                name: 'README.md',
                path: 'docs/README.md',
              },
            ],
          },
        ]}
        currentDocumentPath="docs/README.md"
        statusMessage="项目已接入"
        onConnectProject={() => {}}
        onProjectChange={() => {}}
        onProfileChange={() => {}}
        onModeChange={() => {}}
        onDocumentSelect={() => {}}
      />,
    )

    expect(screen.getByRole('combobox', { name: '项目切换' })).toHaveValue('notes')
    expect(screen.getByRole('combobox', { name: 'Profile 切换' })).toHaveValue('writer')
    expect(screen.getByRole('button', { name: '阅读' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('docs')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'README.md' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('项目已接入')).toBeInTheDocument()
  })
})
