import type {
  ChannelPlugin,
  ChannelMeta,
  ChannelCapabilities,
  ChannelConfigSchema,
  ChannelGroupAdapter,
  ChannelMentionAdapter,
  ChannelMessagingAdapter,
  ChannelOutboundAdapter,
  ChannelOutboundContext,
} from 'openclaw/plugin-sdk'

import { CardBuilder } from '@kookapp/js-sdk'

import type { KookAccount } from './types'
import { kookConfigAdapter } from './config'
import { kookGatewayAdapter, getActiveClient } from './connection-manager'
import { kookSecurityAdapter } from './access-control'
import { kookDirectoryAdapter } from './directory'
import { kookStatusAdapter } from './status'
import type { KookProbe } from './status'
import { formatKMarkdown, stripKookMentions } from './message-utils'

const kookChannelConfigSchema: ChannelConfigSchema = {
  schema: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean', description: '是否启用 KOOK 频道' },
      botToken: { type: 'string', description: 'KOOK 机器人 Token' },
      baseUrl: { type: 'string', description: 'KOOK API 地址（默认: https://www.kookapp.cn）' },
      dmPolicy: {
        type: 'string',
        enum: ['pairing', 'allowlist', 'open', 'disabled'],
        description: '私信访问策略',
      },
      allowFrom: {
        type: 'array',
        items: { type: 'string' },
        description: '允许的发送者 ID 列表（kook:userId 格式），为空则允许所有人',
      },
      trustedGuilds: {
        type: 'array',
        items: { type: 'string' },
        description: '信任的服务器 ID 列表，其中的所有成员自动视为 allowFrom 的一员',
      },
      acceptBotMessage: {
        type: 'boolean',
        description: '是否接收其他机器人的消息并加入上下文（默认: true，不影响自身消息过滤）',
      },
    },
    additionalProperties: false,
  },
  uiHints: {
    botToken: { sensitive: true },
  },
}

const kookMeta: ChannelMeta = {
  id: 'kook',
  label: 'KOOK',
  selectionLabel: 'KOOK',
  docsPath: '/channels/kook',
  blurb: 'Connect to KOOK (formerly KaiHeiLa) messaging platform',
  order: 50,
}

const kookCapabilities: ChannelCapabilities = {
  chatTypes: ['direct', 'group'],
  reactions: true,
  edit: true,
  media: true,
  reply: true,
}

const kookGroupAdapter: ChannelGroupAdapter = {
  resolveRequireMention(params) {
    // Read from dashboard config: channels.kook.groups[groupId].requireMention
    const groups = (params.cfg as any).channels?.kook?.groups
    if (groups) {
      const groupId = params.groupId
      const groupConfig = groupId ? groups[groupId] : undefined
      const defaultConfig = groups['*']

      if (typeof groupConfig?.requireMention === 'boolean') {
        return groupConfig.requireMention
      }
      if (typeof defaultConfig?.requireMention === 'boolean') {
        return defaultConfig.requireMention
      }
    }
    // Default: require mention in groups (same as Telegram/Discord)
    return true
  },
}

const kookMentionAdapter: ChannelMentionAdapter = {
  stripMentions(params) {
    return stripKookMentions(params.text)
  },
}

const kookMessagingAdapter: ChannelMessagingAdapter = {
  normalizeTarget(raw: string) {
    if (raw.startsWith('kook:')) {
      return raw
    }
    // Bare numeric IDs
    if (/^\d+$/.test(raw)) {
      return `kook:${raw}`
    }
    return undefined
  },

  formatTargetDisplay(params) {
    const { target, display } = params
    if (display) {
      return display
    }
    return target.replace(/^kook:/, '')
  },
}

const kookOutboundAdapter: ChannelOutboundAdapter = {
  deliveryMode: 'gateway',
  textChunkLimit: 4000,
  chunkerMode: 'markdown',

  async sendText(ctx: ChannelOutboundContext) {
    try {
      const client = getActiveClient(ctx.accountId ?? 'default')
      if (!client) {
        return { channel: 'kook' as const, messageId: '' }
      }

      const targetId = ctx.to.replace(/^kook:/, '')
      const kmd = formatKMarkdown(ctx.text)

      // Build a card for rich display (Miku-style)
      const card = CardBuilder.fromTemplate({ initialCard: { theme: 'none' } })
      card.addKMarkdownText(kmd)

      const response = await client.api.createMessage({
        target_id: targetId,
        content: card.build(),
        type: 10,
        quote: ctx.replyToId ?? undefined,
      })

      return {
        channel: 'kook' as const,
        messageId: response.data?.msg_id ?? '',
        chatId: targetId,
      }
    } catch (err) {
      return { channel: 'kook' as const, messageId: '' }
    }
  },

  async sendMedia(ctx: ChannelOutboundContext) {
    try {
      const client = getActiveClient(ctx.accountId ?? 'default')
      if (!client) {
        return { channel: 'kook' as const, messageId: '' }
      }

      const targetId = ctx.to.replace(/^kook:/, '')

      // Build card with media
      const card = CardBuilder.fromTemplate({ initialCard: { theme: 'none' } })

      if (ctx.mediaUrl) {
        card.addImage(ctx.mediaUrl)
      }

      if (ctx.text) {
        card.addKMarkdownText(formatKMarkdown(ctx.text))
      }

      const response = await client.api.createMessage({
        target_id: targetId,
        content: card.build(),
        type: 10,
      })

      return {
        channel: 'kook' as const,
        messageId: response.data?.msg_id ?? '',
        chatId: targetId,
      }
    } catch (err) {
      return { channel: 'kook' as const, messageId: '' }
    }
  },
}

export const kookPlugin: ChannelPlugin<KookAccount, KookProbe> = {
  id: 'kook',
  meta: kookMeta,
  capabilities: kookCapabilities,
  configSchema: kookChannelConfigSchema,

  config: kookConfigAdapter,
  gateway: kookGatewayAdapter,
  security: kookSecurityAdapter,
  groups: kookGroupAdapter,
  mentions: kookMentionAdapter,
  messaging: kookMessagingAdapter,
  outbound: kookOutboundAdapter,
  directory: kookDirectoryAdapter,
  status: kookStatusAdapter,

  reload: {
    configPrefixes: ['channels.kook'],
  },
}
