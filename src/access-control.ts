import type {
  ChannelSecurityAdapter,
  ChannelSecurityContext,
  ChannelSecurityDmPolicy,
} from 'openclaw/plugin-sdk'

import type { KookAccount } from './types'

export const kookSecurityAdapter: ChannelSecurityAdapter<KookAccount> = {
  resolveDmPolicy(ctx: ChannelSecurityContext<KookAccount>): ChannelSecurityDmPolicy | null {
    const kookCfg = (ctx.cfg as any).channels?.kook ?? {}
    const policy = kookCfg.dmPolicy ?? 'open'

    return {
      policy,
      allowFrom: kookCfg.allowFrom ?? [],
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
