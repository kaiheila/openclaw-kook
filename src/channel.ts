import type {
  ChannelPlugin,
  ChannelMeta,
  ChannelCapabilities,
  ChannelGroupAdapter,
  ChannelMentionAdapter,
  ChannelMessagingAdapter,
  ChannelOutboundAdapter,
  ChannelOutboundContext,
} from 'openclaw/plugin-sdk/channel-runtime'
import { createTextPairingAdapter, createPairingPrefixStripper } from 'openclaw/plugin-sdk/channel-pairing'
import type { ChannelConfigSchema } from 'openclaw/plugin-sdk'

import { CardBuilder } from '@kookapp/js-sdk'

import { isExperimentalFeaturesEnabled } from './beta'
import type { KookAccount } from './types'
import { kookConfigAdapter } from './config'
import { kookGatewayAdapter, getActiveClient } from './connection-manager'
import { kookSecurityAdapter, normalizeKookAllowEntry } from './access-control'
import { kookDirectoryAdapter } from './directory'
import { kookStatusAdapter } from './status'
import type { KookProbe } from './status'
import { formatKMarkdown, stripKookMentions } from './message-utils'
import { createSendTarget } from './send-service'

const betaEnabled = isExperimentalFeaturesEnabled()
const trustedGuildsDescription = betaEnabled
  ? '信任的服务器 ID 列表，其中的所有成员自动视为 allowFrom 的一员'
  : '信任的服务器 ID 列表（实验功能）。当前未启用时该字段锁定为默认值 []。设置环境变量 ENABLE_EXPERIMENTAL_FEATURES=1 后可编辑并生效。'
const trustedGuildsHelp = betaEnabled
  ? '实验功能已启用。这里配置的服务器成员会自动视为 allowFrom 允许对象。'
  : '当前实验功能未启用：该字段仅展示、不会生效，并会被锁定为默认值 []。如需启用，请设置环境变量 ENABLE_EXPERIMENTAL_FEATURES=1。'
const KOOK_PAIRING_APPROVED_MESSAGE = '✅ OpenClaw access approved. Send a message to start chatting.'

const kookChannelSchemaProperties: Record<string, unknown> = {
  enabled: { type: 'boolean', description: '是否启用 KOOK 频道' },
  botAuth: {
    type: 'string',
    description:
      'KOOK 机器人 Token。可访问 https://developer.kookapp.cn/bot/ 在 KOOK 开发者中心创建机器人，并在机器人配置页的 Token / Bot Token 区域获取。',
  },
  baseUrl: { type: 'string', description: 'KOOK API 地址（默认: https://www.kookapp.cn）' },
  dmPolicy: {
    type: 'string',
    enum: ['pairing', 'allowlist', 'open', 'disabled'],
    description: '私信访问策略',
  },
  allowFrom: {
    type: 'array',
    items: { type: 'string' },
    description: '允许的发送者 ID 列表（kook:userId 或 *）。为空则不允许任何人；如需允许所有人，请显式添加 *。',
  },
  acceptBotMessage: {
    type: 'boolean',
    description: '是否接收其他机器人的消息并加入上下文（默认: true，不影响自身消息过滤）',
  },
  trustedGuilds: {
    type: 'array',
    items: { type: 'string' },
    description: trustedGuildsDescription,
  },
}

const kookChannelUiHints: NonNullable<ChannelConfigSchema['uiHints']> = {
  botAuth: { label: 'Bot Token' },
  trustedGuilds: { advanced: true, help: trustedGuildsHelp },
}

const kookChannelConfigSchema: ChannelConfigSchema = {
  schema: {
    type: 'object',
    properties: kookChannelSchemaProperties,
    additionalProperties: false,
  },
  uiHints: kookChannelUiHints,
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

function parseKookExplicitTarget(raw: string) {
  const normalized = raw.trim().replace(/^kook:/i, '')
  if (!normalized) {
    return null
  }
  if (/^user:/i.test(normalized)) {
    const id = normalized.replace(/^user:/i, '').trim()
    return id ? { to: `kook:user:${id}`, chatType: 'direct' as const } : null
  }
  if (/^channel:/i.test(normalized)) {
    const id = normalized.replace(/^channel:/i, '').trim()
    return id ? { to: `kook:channel:${id}`, chatType: 'channel' as const } : null
  }
  if (/^\d+$/.test(normalized)) {
    return { to: `kook:channel:${normalized}`, chatType: 'channel' as const }
  }
  return null
}

const kookMessagingAdapter: ChannelMessagingAdapter = {
  normalizeTarget(raw: string) {
    const parsed = parseKookExplicitTarget(raw)
    if (parsed) {
      return parsed.to
    }
    return undefined
  },

  parseExplicitTarget({ raw }) {
    return parseKookExplicitTarget(raw)
  },

  inferTargetChatType({ to }) {
    return parseKookExplicitTarget(to)?.chatType
  },

  formatTargetDisplay(params) {
    const { target, display } = params
    if (display) {
      return display
    }
    return target.replace(/^kook:/, '').replace(/^(user:|channel:)/, '')
  },
}

function ensureDirectChatCode(client: NonNullable<ReturnType<typeof getActiveClient>>, userId: string) {
  return client.api.createUserChat({ target_id: userId }).then((response) => {
    const chatCode = response.data?.code
    if (!chatCode) {
      throw new Error(`Failed to create KOOK DM chat for user ${userId}`)
    }
    return chatCode
  })
}

const kookPairingAdapter = createTextPairingAdapter({
  idLabel: 'kookUserId',
  message: KOOK_PAIRING_APPROVED_MESSAGE,
  normalizeAllowEntry: createPairingPrefixStripper(/^(kook|user):/i, normalizeKookAllowEntry),
  notify: async ({ accountId, id, message }) => {
    const client = getActiveClient(accountId ?? 'default')
    if (!client) {
      throw new Error('KOOK client is not connected')
    }

    const userId = normalizeKookAllowEntry(id).replace(/^kook:/i, '')
    const chatCode = await ensureDirectChatCode(client, userId)

    const card = CardBuilder.fromTemplate({ initialCard: { theme: 'none' } })
    card.addKMarkdownText(formatKMarkdown(message))

    await client.api.createDirectMessage({
      chat_code: chatCode,
      content: card.build(),
      type: 10,
    })
  },
})

const kookOutboundAdapter: ChannelOutboundAdapter = {
  deliveryMode: 'gateway',
  textChunkLimit: 4000,
  chunkerMode: 'markdown',
  resolveTarget: ({ to }) => {
    if (!to) {
      return { ok: false, error: new Error('Missing KOOK target') }
    }
    const parsed = parseKookExplicitTarget(to)
    if (!parsed) {
      return { ok: false, error: new Error(`Invalid KOOK target: ${to}`) }
    }
    return { ok: true, to: parsed.to }
  },

  async sendText(ctx: ChannelOutboundContext) {
    try {
      const client = getActiveClient(ctx.accountId ?? 'default')
      if (!client) {
        return { channel: 'kook' as const, messageId: '' }
      }

      const target = createSendTarget(ctx.to)
      const kmd = formatKMarkdown(ctx.text)

      const card = CardBuilder.fromTemplate({ initialCard: { theme: 'none' } })
      card.addKMarkdownText(kmd)

      const response =
        target.chatType === 'direct'
          ? await client.api.createDirectMessage({
              chat_code: await ensureDirectChatCode(client, target.userId),
              content: card.build(),
              type: 10,
              quote: ctx.replyToId ?? undefined,
            })
          : await client.api.createMessage({
              target_id: target.targetId,
              content: card.build(),
              type: 10,
              quote: ctx.replyToId ?? undefined,
            })

      return {
        channel: 'kook' as const,
        messageId: response.data?.msg_id ?? '',
        chatId: target.targetId,
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

      const target = createSendTarget(ctx.to)

      const card = CardBuilder.fromTemplate({ initialCard: { theme: 'none' } })

      if (ctx.mediaUrl) {
        card.addImage(ctx.mediaUrl)
      }

      if (ctx.text) {
        card.addKMarkdownText(formatKMarkdown(ctx.text))
      }

      const response =
        target.chatType === 'direct'
          ? await client.api.createDirectMessage({
              chat_code: await ensureDirectChatCode(client, target.userId),
              content: card.build(),
              type: 10,
              quote: ctx.replyToId ?? undefined,
            })
          : await client.api.createMessage({
              target_id: target.targetId,
              content: card.build(),
              type: 10,
            })

      return {
        channel: 'kook' as const,
        messageId: response.data?.msg_id ?? '',
        chatId: target.targetId,
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
  pairing: kookPairingAdapter,
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
