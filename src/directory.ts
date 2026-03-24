import type {
  ChannelDirectoryAdapter,
  ChannelDirectoryEntry,
  OpenClawConfig,
  RuntimeEnv,
} from 'openclaw/plugin-sdk'

import { getActiveClient } from './connection-manager'

export const kookDirectoryAdapter: ChannelDirectoryAdapter = {
  async self(params): Promise<ChannelDirectoryEntry | null> {
    const client = getActiveClient(params.accountId ?? 'default')
    if (!client?.me) {
      return null
    }

    return {
      id: client.me.id,
      name: client.me.username,
      kind: 'user',
    }
  },

  async listGroups(params): Promise<ChannelDirectoryEntry[]> {
    const client = getActiveClient(params.accountId ?? 'default')
    if (!client) {
      return []
    }

    const response = await client.api.listGuilds({})
    if (!response.data?.items) {
      return []
    }

    return response.data.items.map((guild) => ({
      id: guild.id,
      name: guild.name,
      kind: 'group' as const,
    }))
  },

  async listGroupMembers(params): Promise<ChannelDirectoryEntry[]> {
    const client = getActiveClient(params.accountId ?? 'default')
    if (!client) {
      return []
    }

    const response = await client.api.listGuildMembers({
      guild_id: params.groupId,
    })
    if (!response.data?.items) {
      return []
    }

    return response.data.items.map((member) => ({
      id: member.id,
      name: member.nickname ?? member.username,
      kind: 'user' as const,
    }))
  },
}
