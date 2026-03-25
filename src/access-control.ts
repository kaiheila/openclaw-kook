import type {
  ChannelSecurityAdapter,
  ChannelSecurityContext,
  ChannelSecurityDmPolicy,
} from 'openclaw/plugin-sdk/channel-runtime'

import type { KookAccount } from './types'

export function normalizeKookAllowEntry(raw: string): string {
  const trimmed = raw.trim().replace(/^kook:/i, '').replace(/^user:/i, '').trim()
  return `kook:${trimmed}`
}

export const kookSecurityAdapter: ChannelSecurityAdapter<KookAccount> = {
  resolveDmPolicy(ctx: ChannelSecurityContext<KookAccount>): ChannelSecurityDmPolicy | null {
    const isPairing = ctx.account.dmPolicy === 'pairing'

    return {
      policy: ctx.account.dmPolicy,
      allowFrom: ctx.account.allowFrom,
      allowFromPath: 'channels.kook.allowFrom',
      approveHint: isPairing
        ? '使用 OpenClaw 的 pairing approve 流程批准该 KOOK 用户，或手动将其添加到 channels.kook.allowFrom'
        : '在 openclaw.json 的 channels.kook.allowFrom 中添加 KOOK 用户 ID',
      normalizeEntry: normalizeKookAllowEntry,
    }
  },
}
