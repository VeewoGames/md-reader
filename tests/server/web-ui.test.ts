import { describe, expect, it } from 'vitest'

import { shouldServeSpaDocument } from '../../server/web-ui.mjs'

describe('shouldServeSpaDocument', () => {
  it('allows normal HTML navigations', () => {
    expect(
      shouldServeSpaDocument({
        method: 'GET',
        pathname: '/',
        accept: 'text/html,application/xhtml+xml',
      }),
    ).toBe(true)
  })

  it('rejects api routes and asset requests', () => {
    expect(
      shouldServeSpaDocument({
        method: 'GET',
        pathname: '/api/health',
        accept: 'application/json',
      }),
    ).toBe(false)

    expect(
      shouldServeSpaDocument({
        method: 'GET',
        pathname: '/src/main.tsx',
        accept: '*/*',
      }),
    ).toBe(false)
  })

  it('keeps spa fallback for extensionless deep links', () => {
    expect(
      shouldServeSpaDocument({
        method: 'GET',
        pathname: '/workspace/readme',
        accept: '*/*',
      }),
    ).toBe(true)
  })
})
