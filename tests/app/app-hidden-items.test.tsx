import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import App from '../../src/App'

describe('App hidden items mode', () => {
  it('starts with showHiddenItems disabled on a fresh mount', async () => {
    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '显示隐藏项' })).toHaveAttribute(
        'aria-pressed',
        'false',
      )
    })
  })
})
