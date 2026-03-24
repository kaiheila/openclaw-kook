import type {
  ChannelSecurityAdapter,
  ChannelSecurityContext,
  ChannelSecurityDmPolicy,
} from 'openclaw/plugin-sdk/channel-runtime'

import type { KookAccount } from './types'

export const kookSecurityAdapter: ChannelSecurityAdapter<KookAccount> = {
  resolveDmPolicy(ctx: ChannelSecurityContext<KookAccount>): ChannelSecurityDmPolicy | null {
    return {
      policy: ctx.account.dmPolicy,
      allowFrom: ctx.account.allowFrom,
      allowFromPath: 'channels.kook.allowFrom',
      approveHint: '在 openclaw.json 的 channels.kook.allowFrom 中添加 KOOK 用户 ID',
      normalizeEntry(raw: string): string {
        if (raw.startsWith('kook:')) {
          return raw
        }
        return `kook:${raw}`
      },
    }
  },
}
