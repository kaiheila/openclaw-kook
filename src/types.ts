export interface KookChannelConfig {
  botToken: string
  enabled?: boolean
  baseUrl?: string
  logLevel?: string
  trustedGuilds?: string[]
  acceptBotMessage?: boolean
}

export interface KookAccount {
  botToken: string
  enabled: boolean
  baseUrl: string
  logLevel: string
  trustedGuilds: string[]
  acceptBotMessage: boolean
}

export function resolveKookConfig(cfg: any, accountId?: string | null): KookChannelConfig {
  const channels = cfg.channels ?? {}
  const section = channels.kook ?? {}

  if (accountId && accountId !== 'default') {
    const accounts = section.accounts ?? {}
    return accounts[accountId] ?? section
  }

  return section
}

export function resolveKookAccount(cfg: any, accountId?: string | null): KookAccount {
  const raw = resolveKookConfig(cfg, accountId)

  return {
    botToken: raw.botToken ?? '',
    enabled: raw.enabled !== false,
    baseUrl: raw.baseUrl ?? 'https://www.kookapp.cn',
    logLevel: raw.logLevel ?? 'info',
    trustedGuilds: raw.trustedGuilds ?? [],
    acceptBotMessage: raw.acceptBotMessage !== false,
  }
}

export function listKookAccountIds(cfg: any): string[] {
  const channels = cfg.channels ?? {}
  const section = channels.kook ?? {}

  if (section.accounts) {
    return Object.keys(section.accounts)
  }

  if (section.botToken) {
    return ['default']
  }

  return []
}
