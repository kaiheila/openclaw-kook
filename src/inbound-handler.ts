import type { ChannelLogSink, OpenClawConfig, ReplyPayload } from 'openclaw/plugin-sdk'
import {
  buildPendingHistoryContextFromMap,
  clearHistoryEntriesIfEnabled,
  recordPendingHistoryEntryIfEnabled,
} from 'openclaw/plugin-sdk'

import type { KEvent, KTextChannelExtra } from '@kookapp/js-sdk'
import { extractContent, isExplicitlyMentioningBot } from '@kookapp/js-sdk'
import type { StreamingCard as StreamingCardType } from '@kookapp/js-sdk'

import { buildMsgContext } from './message-utils'
import { formatKMarkdown } from './message-utils'
import { getKookRuntime } from './runtime'

export interface HistoryEntry {
  sender: string
  body: string
  timestamp?: number
  messageId?: string
}

interface InboundHandlerDeps {
  cfg: OpenClawConfig
  botUserId: string
  botName: string
  accountId: string
  log?: ChannelLogSink
  groupHistories: Map<string, HistoryEntry[]>
  historyLimit: number
  acceptBotMessage: boolean
  trustedGuilds: string[]
  deliverReply: (channelId: string, text: string, replyToId?: string) => Promise<void>
  deliverCardReply: (channelId: string, cardJson: string, replyToId?: string) => Promise<void>
  createStreamingCard: (channelId: string, replyToId?: string) => StreamingCardType
}

export function createInboundHandler(deps: InboundHandlerDeps) {
  const { cfg, botUserId, accountId, log, groupHistories, historyLimit, acceptBotMessage } = deps

  return async function handleTextChannelEvent(event: KEvent<KTextChannelExtra>) {
    try {
      await handleTextChannelEventInner(event)
    } catch (err) {
      log?.error?.(`Unhandled error in KOOK inbound handler: ${err}`)
    }
  }

  async function handleTextChannelEventInner(event: KEvent<KTextChannelExtra>) {
    // Always skip self messages
    if (event.author_id === botUserId) {
      return
    }

    // Skip other bots unless acceptBotMessage is enabled
    const isBot = event.extra?.author?.bot === true
    if (isBot && !acceptBotMessage) {
      return
    }

    const runtime = getKookRuntime()

    const mentioned = isExplicitlyMentioningBot(event, botUserId)
    const chatType = event.channel_type === 'PERSON' ? 'direct' : 'group'
    const isGroup = chatType === 'group'

    // Build sender label
    const senderName = event.extra?.author?.nickname ?? event.extra?.author?.username ?? event.author_id

    const body = extractContent(event)

    // --- Plugin-level slash command interception ---
    // Handle commands locally before passing to OpenClaw
    const trimmedBody = body.trim()
    const pluginCommand = parsePluginCommand(trimmedBody)
    if (pluginCommand) {
      const channelId = event.channel_type === 'PERSON' ? undefined : event.target_id
      if (channelId) {
        try {
          await handlePluginCommand(pluginCommand, {
            runtime,
            deps,
            event,
            channelId,
            chatType,
            accountId,
          })
        } catch (err) {
          log?.error?.(`Plugin command error: ${err}`)
        }
      }
      return // Do NOT forward to OpenClaw
    }

    // History key: channelId (all messages in the same KOOK channel share context)
    const historyKey = isGroup ? event.target_id : ''

    // For groups, check mention gating
    if (isGroup) {
      let requireMention = true
      try {
        requireMention = runtime.channel.groups.resolveRequireMention({
          cfg,
          channel: 'kook',
          accountId,
          groupId: event.extra?.guild_id ?? null,
        })
      } catch {
        // Fall back to default (require mention)
      }

      if (requireMention && !mentioned) {
        // Record into pending history so AI sees context when finally @'d
        recordPendingHistoryEntryIfEnabled({
          historyMap: groupHistories,
          historyKey,
          limit: historyLimit,
          entry: historyKey
            ? {
                sender: senderName,
                body,
                timestamp: event.msg_timestamp,
                messageId: event.msg_id,
              }
            : null,
        })
        return
      }
    }

    // Record inbound activity
    try {
      runtime.channel.activity.record({
        channel: 'kook',
        accountId,
        direction: 'inbound',
      })
    } catch {
      // Non-critical
    }

    // Resolve agent routing
    const guildId = event.extra?.guild_id ?? null
    const peerId = chatType === 'direct' ? event.author_id : event.target_id

    const peerKind = chatType === 'direct' ? 'dm' : 'group'

    const route = runtime.channel.routing.resolveAgentRoute({
      cfg,
      channel: 'kook',
      accountId,
      peer: {
        kind: peerKind,
        id: peerId,
      } as any,
      guildId,
    })

    // Build envelope for current message
    const envelope = runtime.channel.reply.formatInboundEnvelope({
      channel: 'kook',
      from: `kook:${event.author_id}`,
      body,
      timestamp: event.msg_timestamp,
      chatType,
      senderLabel: senderName,
    })

    // Inject pending group history into the body
    let combinedBody = envelope
    if (isGroup && historyKey && historyLimit > 0) {
      combinedBody = buildPendingHistoryContextFromMap({
        historyMap: groupHistories,
        historyKey,
        limit: historyLimit,
        currentMessage: envelope,
        formatEntry: (entry) =>
          runtime.channel.reply.formatInboundEnvelope({
            channel: 'kook',
            from: `kook:${event.author_id}`,
            body: entry.body,
            timestamp: entry.timestamp,
            chatType: 'group',
            senderLabel: entry.sender,
          }),
      })
    }

    // Build InboundHistory (structured JSON for system prompt)
    const inboundHistory =
      isGroup && historyKey && historyLimit > 0
        ? (groupHistories.get(historyKey) ?? []).map((entry) => ({
            sender: entry.sender,
            body: entry.body,
            timestamp: entry.timestamp,
          }))
        : undefined

    // Resolve command authorization
    let commandAuthorized = false
    try {
      const shouldCheckCommand = runtime.channel.commands.shouldComputeCommandAuthorized(body, cfg)
      if (shouldCheckCommand) {
        commandAuthorized = runtime.channel.commands.resolveCommandAuthorizedFromAuthorizers({
          useAccessGroups: false,
          authorizers: [
            {
              configured: chatType === 'direct',
              allowed: chatType === 'direct',
            },
          ],
          modeWhenAccessGroupsOff: 'allow',
        })
      }
    } catch {
      // Fall back to unauthorized
    }

    // Build MsgContext with history-enriched body
    const ctx = buildMsgContext({
      event,
      body: combinedBody,
      rawBody: body,
      envelope: combinedBody,
      sessionKey: route.sessionKey,
      accountId,
      chatType,
      mentioned,
      senderName,
      guildId,
      commandAuthorized,
      inboundHistory,
    })

    // Finalize inbound context
    const finalizedCtx = runtime.channel.reply.finalizeInboundContext(ctx)

    // Record session
    const storePath = runtime.channel.session.resolveStorePath(undefined, {
      agentId: route.agentId,
    })

    await runtime.channel.session.recordInboundSession({
      storePath,
      sessionKey: route.sessionKey,
      ctx: finalizedCtx,
      onRecordError(err) {
        log?.error?.(`Failed to record inbound session: ${err}`)
      },
    })

    // Clear group history helper
    const clearGroupHistory = () => {
      if (isGroup && historyKey) {
        clearHistoryEntriesIfEnabled({ historyMap: groupHistories, historyKey, limit: historyLimit })
      }
    }

    // Streaming card for incremental updates
    const channelId = event.channel_type === 'PERSON' ? undefined : event.target_id

    const state: { streamingCard: StreamingCardType | null } = { streamingCard: null }

    // Immediately send a "typing" placeholder card
    if (channelId) {
      try {
        state.streamingCard = deps.createStreamingCard(channelId, event.msg_id)
        await state.streamingCard.initialize()
      } catch (err) {
        log?.error?.(`Failed to send typing indicator: ${err}`)
        state.streamingCard = null
      }
    }

    // Dispatch reply
    await runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
      ctx: finalizedCtx,
      cfg,
      dispatcherOptions: {
        deliver: async (payload: ReplyPayload) => {
          try {
            const text = payload.text
            if (!text || !channelId) {
              return
            }

            // Record outbound activity
            try {
              runtime.channel.activity.record({
                channel: 'kook',
                accountId,
                direction: 'outbound',
              })
            } catch {
              // Non-critical
            }

            // Create streaming card if not yet created (fallback)
            if (!state.streamingCard) {
              state.streamingCard = deps.createStreamingCard(channelId, event.msg_id)
            }

            // Append text as KMarkdown
            const kmd = formatKMarkdown(text)
            await state.streamingCard!.appendText(kmd)
          } catch (err) {
            log?.error?.(`Failed to deliver reply block: ${err}`)
          }
        },
        onError(err) {
          log?.error?.(`Reply dispatch error: ${err}`)
        },
      },
    })

    // Finalize streaming card (remove any trailing placeholders)
    try {
      if (state.streamingCard) {
        await state.streamingCard.finalize()
      }
    } catch (err) {
      log?.error?.(`Failed to finalize streaming card: ${err}`)
    }

    // Clear pending history after reply
    clearGroupHistory()
  }
}

// --- Plugin command system ---

interface PluginCommand {
  name: string
  args: string
}

/** Commands intercepted by the plugin (never reach OpenClaw) */
const PLUGIN_COMMANDS = new Set(['print-context', 'ctx', 'new', 'reset', 'clear'])

function parsePluginCommand(text: string): PluginCommand | null {
  // Match /command or /command args
  const match = text.match(/^\/([a-zA-Z][\w-]*)\s*(.*)$/s)
  if (!match) return null
  const name = match[1].toLowerCase()
  if (!PLUGIN_COMMANDS.has(name)) return null
  return { name, args: match[2].trim() }
}

interface PluginCommandContext {
  runtime: ReturnType<typeof getKookRuntime>
  deps: InboundHandlerDeps
  event: KEvent<KTextChannelExtra>
  channelId: string
  chatType: string
  accountId: string
}

async function handlePluginCommand(cmd: PluginCommand, ctx: PluginCommandContext): Promise<void> {
  const { runtime, deps, event, channelId } = ctx

  switch (cmd.name) {
    case 'print-context':
    case 'ctx':
      return handlePrintContext(ctx)

    case 'new':
    case 'reset':
    case 'clear':
      return handleSessionReset(ctx)
  }
}

async function handlePrintContext(ctx: PluginCommandContext): Promise<void> {
  const { runtime, deps, event, channelId, chatType, accountId } = ctx

  const guildId = event.extra?.guild_id ?? null
  const peerId = chatType === 'direct' ? event.author_id : event.target_id
  const peerKind = chatType === 'direct' ? 'dm' : 'group'

  let route: { sessionKey: string; agentId: string }
  try {
    route = runtime.channel.routing.resolveAgentRoute({
      cfg: deps.cfg,
      channel: 'kook',
      accountId,
      peer: { kind: peerKind, id: peerId } as any,
      guildId,
    })
  } catch (err) {
    await deps.deliverReply(channelId, `无法解析路由: ${err}`, event.msg_id)
    return
  }

  let messages: unknown[] = []
  try {
    const result = await runtime.subagent.getSessionMessages({
      sessionKey: route.sessionKey,
      limit: 50,
    })
    messages = result.messages ?? []
  } catch (err) {
    await deps.deliverReply(channelId, `无法读取会话: ${err}`, event.msg_id)
    return
  }

  if (messages.length === 0) {
    await deps.deliverReply(channelId, `当前会话为空 (sessionKey: \`${route.sessionKey}\`)`, event.msg_id)
    return
  }

  // Format context summary
  const lines: string[] = [
    `**会话上下文** (sessionKey: \`${route.sessionKey}\`, agentId: \`${route.agentId}\`)`,
    `共 ${messages.length} 条消息:`,
    '---',
  ]

  for (const msg of messages) {
    const m = msg as any
    const role = m.role ?? '?'
    const content = extractMessageContent(m)
    const preview = content.length > 300 ? content.slice(0, 300) + '...' : content
    lines.push(`**${role}**: ${preview}`)
  }

  await deps.deliverReply(channelId, lines.join('\n'), event.msg_id)
}

/**
 * Extract human-readable text from a session message.
 *
 * User messages from OpenClaw are wrapped in an envelope like:
 *   Conversation info (untrusted metadata):\n```json\n{...}\n```\n\n<actual message>
 * This function strips the envelope and returns just the message body.
 *
 * Assistant messages may be a string or content parts array.
 */
function extractMessageContent(msg: any): string {
  const raw =
    typeof msg.content === 'string'
      ? msg.content
      : Array.isArray(msg.content)
        ? msg.content
            .filter((p: any) => p.type === 'text' || typeof p.text === 'string')
            .map((p: any) => p.text ?? '')
            .join(' ')
        : JSON.stringify(msg.content)

  // Strip OpenClaw inbound envelope (untrusted metadata block)
  // Pattern: "Conversation info (untrusted metadata):\n```json\n{...}\n```\n\n<body>"
  const envelopeMatch = raw.match(/^Conversation info \(untrusted metadata\):\s*```json\s*[\s\S]*?```\s*\n*([\s\S]*)$/m)
  if (envelopeMatch) {
    return envelopeMatch[1].trim() || '(empty)'
  }

  return raw.trim() || '(empty)'
}

async function handleSessionReset(ctx: PluginCommandContext): Promise<void> {
  const { runtime, deps, event, channelId, chatType, accountId } = ctx

  const guildId = event.extra?.guild_id ?? null
  const peerId = chatType === 'direct' ? event.author_id : event.target_id
  const peerKind = chatType === 'direct' ? 'dm' : 'group'

  let route: { sessionKey: string; agentId: string }
  try {
    route = runtime.channel.routing.resolveAgentRoute({
      cfg: deps.cfg,
      channel: 'kook',
      accountId,
      peer: { kind: peerKind, id: peerId } as any,
      guildId,
    })
  } catch (err) {
    await deps.deliverReply(channelId, `无法解析路由: ${err}`, event.msg_id)
    return
  }

  try {
    await runtime.subagent.deleteSession({
      sessionKey: route.sessionKey,
    })
    await deps.deliverReply(channelId, `会话已重置`, event.msg_id)
  } catch (err) {
    await deps.deliverReply(channelId, `会话重置失败: ${err}`, event.msg_id)
  }
}
