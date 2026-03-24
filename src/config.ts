import type {
  ChannelConfigAdapter,
  OpenClawConfig,
  ChannelAccountSnapshot,
} from 'openclaw/plugin-sdk'
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from 'openclaw/plugin-sdk'

import type { KookAccount } from './types'
import { listKookAccountIds, resolveKookAccount } from './types'

export const kookConfigAdapter: ChannelConfigAdapter<KookAccount> = {
  listAccountIds(cfg: OpenClawConfig): string[] {
    return listKookAccountIds(cfg)
  },

  resolveAccount(cfg: OpenClawConfig, accountId?: string | null): KookAccount {
    const id = normalizeAccountId(accountId)
    return resolveKookAccount(cfg, id)
  },

  defaultAccountId(): string {
    return DEFAULT_ACCOUNT_ID
  },

  isEnabled(account: KookAccount): boolean {
    return account.enabled
  },

  isConfigured(account: KookAccount): boolean {
    return account.botToken.length > 0
  },

  describeAccount(account: KookAccount, cfg: OpenClawConfig): ChannelAccountSnapshot {
    const configured = account.botToken.length > 0
    const enabled = account.enabled

    return {
      accountId: DEFAULT_ACCOUNT_ID,
      enabled,
      configured,
      name: 'KOOK',
    }
  },
}
