import { describe, expect, it } from 'vitest'

import { isKookSenderAllowed, resolveKookAccess } from '../src/access-control'
import { resolveKookAccount } from '../src/types'

describe('KOOK allowFrom policy', () => {
  it('denies DM access when dmPolicy=open and allowFrom is empty', () => {
    const access = resolveKookAccess({
      isGroup: false,
      dmPolicy: 'open',
      allowFrom: [],
      storeAllowFrom: [],
      userId: '123456',
    })

    expect(access.decision).toBe('block')
  })

  it('allows DM access when dmPolicy=open and wildcard is configured', () => {
    const access = resolveKookAccess({
      isGroup: false,
      dmPolicy: 'open',
      allowFrom: ['*'],
      storeAllowFrom: [],
      userId: '123456',
    })

    expect(access.decision).toBe('allow')
  })

  it('blocks group access when sender is not in allowFrom', () => {
    const access = resolveKookAccess({
      isGroup: true,
      dmPolicy: 'open',
      allowFrom: ['kook:999999'],
      storeAllowFrom: [],
      userId: '123456',
    })

    expect(access.decision).toBe('block')
  })

  it('allows group access when sender is in allowFrom', () => {
    const access = resolveKookAccess({
      isGroup: true,
      dmPolicy: 'open',
      allowFrom: ['kook:123456'],
      storeAllowFrom: [],
      userId: '123456',
    })

    expect(access.decision).toBe('allow')
  })

  it('matches both raw and normalized KOOK sender ids', () => {
    expect(isKookSenderAllowed(['123456'], '123456')).toBe(true)
    expect(isKookSenderAllowed(['kook:123456'], '123456')).toBe(true)
    expect(isKookSenderAllowed([], '123456')).toBe(false)
  })

  it('keeps trustedGuilds visible but locked to default when experimental features are disabled', () => {
    const previous = process.env.ENABLE_EXPERIMENTAL_FEATURES
    delete process.env.ENABLE_EXPERIMENTAL_FEATURES

    try {
      const account = resolveKookAccount({
        channels: {
          kook: {
            trustedGuilds: ['guild-1'],
          },
        },
      })

      expect(account.trustedGuilds).toEqual([])
    } finally {
      if (typeof previous === 'undefined') {
        delete process.env.ENABLE_EXPERIMENTAL_FEATURES
      } else {
        process.env.ENABLE_EXPERIMENTAL_FEATURES = previous
      }
    }
  })
})
