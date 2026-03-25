import { readFile, unlink } from 'fs/promises'
import { dirname } from 'path'

import { resolveSessionStoreEntry, updateSessionStore } from 'openclaw/plugin-sdk/config-runtime'
import type { ChannelLogSink } from 'openclaw/plugin-sdk/channel-runtime'
import { createChannelPairingController } from 'openclaw/plugin-sdk/channel-pairing'
import { readStoreAllowFromForDmPolicy } from 'openclaw/plugin-sdk/channel-policy'
import type { OpenClawConfig } from 'openclaw/plugin-sdk/core'
import type { ReplyPayload } from 'openclaw/plugin-sdk/reply-runtime'
import {
  buildPendingHistoryContextFromMap,
  clearHistoryEntriesIfEnabled,
  recordPendingHistoryEntryIfEnabled,
} from 'openclaw/plugin-sdk/reply-history'

import type { KEvent, KTextChannelExtra } from '@kookapp/js-sdk'
import { extractContent, isExplicitlyMentioningBot } from '@kookapp/js-sdk'

import { buildMsgContext } from './message-utils'
import { formatKMarkdown } from './message-utils'
import { resolveKookAccess } from './access-control'
import { getKookRuntime } from './runtime'
import type { StreamingMessageHandle } from './send-service'
import type { SendTarget } from './send-service'

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
  dmPolicy: 'pairing' | 'allowlist' | 'open' | 'disabled'
  allowFrom: string[]
  trustedGuilds: string[]
  isUserInTrustedGuilds: (userId: string, guildIds: string[]) => Promise<boolean>
  deliverReply: (target: SendTarget, text: string, replyToId?: string) => Promise<void>
  deliverCardReply: (target: SendTarget, cardJson: string, replyToId?: string) => Promise<void>
  createStreamingCard: (target: SendTarget, replyToId?: string) => StreamingMessageHandle
  supportsStreaming: (target: SendTarget) => boolean
}

export function createInboundHandler(deps: InboundHandlerDeps) {
  const {
    cfg,
    botUserId,
    accountId,
    log,
    groupHistories,
    historyLimit,
    acceptBotMessage,
    dmPolicy,
    allowFrom,
    trustedGuilds,
    isUserInTrustedGuilds,
  } = deps

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
    const pairing = createChannelPairingController({
      core: runtime,
      channel: 'kook',
      accountId,
    })

    const mentioned = isExplicitlyMentioningBot(event, botUserId)
    const chatType = event.channel_type === 'PERSON' ? 'direct' : 'group'
    const isGroup = chatType === 'group'
    const replyTarget: SendTarget = isGroup
      ? { chatType: 'group', targetId: event.target_id }
      : { chatType: 'direct', targetId: event.target_id, userId: event.author_id }

    // Build sender label
    const senderName = event.extra?.author?.nickname ?? event.extra?.author?.username ?? event.author_id

    const body = extractContent(event)
    const trimmedBody = body.trim()
    const pluginCommand = parsePluginCommand(trimmedBody)

    // History key: channelId (all messages in the same KOOK channel share context)
    const historyKey = isGroup ? event.target_id : ''

    const storeAllowFrom =
      dmPolicy === 'pairing'
        ? await readStoreAllowFromForDmPolicy({
            provider: 'kook',
            accountId,
            dmPolicy,
          })
        : []

    const currentGuildId = event.extra?.guild_id ?? null
    const trustedGuildAllowed = isGroup
      ? Boolean(currentGuildId && trustedGuilds.includes(currentGuildId))
      : trustedGuilds.length > 0
        ? await isUserInTrustedGuilds(event.author_id, trustedGuilds)
        : false
    const effectiveAllowFrom = trustedGuildAllowed ? [...allowFrom, `kook:${event.author_id}`, event.author_id] : allowFrom

    const access = resolveKookAccess({
      isGroup,
      dmPolicy,
      allowFrom: effectiveAllowFrom,
      storeAllowFrom,
      userId: event.author_id,
    })
    const senderAuthorized = access.decision === 'allow'

    if (!senderAuthorized) {
      try {
        if (!isGroup && access.decision === 'pairing') {
          await pairing.issueChallenge({
            senderId: event.author_id,
            senderIdLine: `你的 KOOK 用户 ID: ${event.author_id}`,
            meta: { name: senderName || undefined },
            onCreated: ({ code }) => {
              log?.info?.(`KOOK pairing request created for ${event.author_id} (code=${code})`)
            },
            sendPairingReply: async (text) => {
              await deps.deliverReply(replyTarget, text, event.msg_id)
            },
            onReplyError: (err) => {
              log?.error?.(`Failed to deliver KOOK pairing challenge: ${err}`)
            },
          })
        } else if (!isGroup) {
          await deps.deliverReply(replyTarget, '当前私信访问策略不允许该会话访问。', event.msg_id)
        }
      } catch (err) {
        log?.error?.(`Failed to deliver DM policy response: ${err}`)
      }
      return
    }

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

    // --- Plugin-level slash command interception ---
    // Only handle commands after access-control and mention gating succeed.
    if (pluginCommand && senderAuthorized && (!isGroup || mentioned)) {
      try {
        await handlePluginCommand(pluginCommand, {
          runtime,
          deps,
          event,
          replyTarget,
          chatType,
          accountId,
          senderAuthorized,
        })
      } catch (err) {
        log?.error?.(`Plugin command error: ${err}`)
      }
      return // Do NOT forward to OpenClaw
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
        commandAuthorized = senderAuthorized
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

    const canStream = deps.supportsStreaming(replyTarget)
    const state: { streamingCard: StreamingMessageHandle | null } = { streamingCard: null }

    // Immediately send a "typing" placeholder card for supported targets only
    if (canStream) {
      try {
        state.streamingCard = deps.createStreamingCard(replyTarget, event.msg_id)
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
            if (!text) {
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

            if (!canStream) {
              await deps.deliverReply(replyTarget, text, event.msg_id)
              return
            }

            // Create streaming card if not yet created (fallback)
            if (!state.streamingCard) {
              state.streamingCard = deps.createStreamingCard(replyTarget, event.msg_id)
            }

            // Append text as KMarkdown
            const kmd = formatKMarkdown(text)
            await state.streamingCard.appendText(kmd)
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
  replyTarget: SendTarget
  chatType: string
  accountId: string
  senderAuthorized: boolean
}

interface ResolvedPluginSessionRoute {
  sessionKey: string
  agentId: string
  storePath: string
}

interface TranscriptMessage {
  role?: string
  content?: string | Array<{ type?: string; text?: string }> | null
}

async function handlePluginCommand(cmd: PluginCommand, ctx: PluginCommandContext): Promise<void> {
  if (!ctx.senderAuthorized) {
    return
  }

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
  const { deps, event, replyTarget } = ctx

  let route: ResolvedPluginSessionRoute
  try {
    route = resolvePluginSessionRoute(ctx)
  } catch (err) {
    await deps.deliverReply(replyTarget, `无法解析路由: ${err}`, event.msg_id)
    return
  }

  let messages: TranscriptMessage[] = []
  try {
    messages = await readPluginSessionMessages(route)
  } catch (err) {
    await deps.deliverReply(replyTarget, `无法读取会话: ${err}`, event.msg_id)
    return
  }

  if (messages.length === 0) {
    await deps.deliverReply(replyTarget, `当前会话为空 (sessionKey: \`${route.sessionKey}\`)`, event.msg_id)
    return
  }

  const lines: string[] = [
    `**会话上下文** (sessionKey: \`${route.sessionKey}\`, agentId: \`${route.agentId}\`)`,
    `共 ${messages.length} 条消息:`,
    '---',
  ]

  for (const msg of messages) {
    const role = msg.role ?? '?'
    const content = extractMessageContent(msg)
    const preview = content.length > 300 ? content.slice(0, 300) + '...' : content
    lines.push(`**${role}**: ${preview}`)
  }

  await deps.deliverReply(replyTarget, lines.join('\n'), event.msg_id)
}

function resolvePluginSessionRoute(ctx: PluginCommandContext): ResolvedPluginSessionRoute {
  const { runtime, deps, event, chatType, accountId } = ctx
  const guildId = event.extra?.guild_id ?? null
  const peerId = chatType === 'direct' ? event.author_id : event.target_id
  const peerKind = chatType === 'direct' ? 'dm' : 'group'

  const route = runtime.channel.routing.resolveAgentRoute({
    cfg: deps.cfg,
    channel: 'kook',
    accountId,
    peer: { kind: peerKind, id: peerId } as any,
    guildId,
  })

  return {
    sessionKey: route.sessionKey,
    agentId: route.agentId,
    storePath: runtime.channel.session.resolveStorePath(undefined, { agentId: route.agentId }),
  }
}

async function readPluginSessionMessages(route: ResolvedPluginSessionRoute): Promise<TranscriptMessage[]> {
  const store = runtimeSafeLoadSessionStore(route.storePath)
  const { existing } = resolveSessionStoreEntry({
    store,
    sessionKey: route.sessionKey,
  })

  if (!existing?.sessionId) {
    return []
  }

  const transcriptPath = resolvePluginTranscriptPath(route, existing.sessionId, existing.sessionFile)
  const transcript = await readFile(transcriptPath, 'utf8')
  const messages: TranscriptMessage[] = []

  for (const line of transcript.split(/\r?\n/)) {
    if (!line.trim()) {
      continue
    }

    try {
      const parsed = JSON.parse(line) as { message?: TranscriptMessage }
      if (parsed.message && (parsed.message.role === 'user' || parsed.message.role === 'assistant')) {
        messages.push(parsed.message)
      }
    } catch {
      // Ignore malformed transcript lines.
    }
  }

  return messages.slice(-50)
}

async function resetPluginSession(route: ResolvedPluginSessionRoute): Promise<void> {
  const removedSessionFiles = await updateSessionStore(route.storePath, (store) => {
    const { normalizedKey, existing, legacyKeys } = resolveSessionStoreEntry({
      store,
      sessionKey: route.sessionKey,
    })

    if (!existing?.sessionId) {
      return [] as Array<[string, string | undefined]>
    }

    delete store[normalizedKey]
    for (const legacyKey of legacyKeys) {
      delete store[legacyKey]
    }

    return [[existing.sessionId, existing.sessionFile] as [string, string | undefined]]
  })

  await Promise.all(
    removedSessionFiles.map(async ([sessionId, sessionFile]) => {
      const transcriptPath = resolvePluginTranscriptPath(route, sessionId, sessionFile)
      try {
        await unlink(transcriptPath)
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code
        if (code !== 'ENOENT') {
          throw err
        }
      }
    }),
  )
}

function runtimeSafeLoadSessionStore(storePath: string) {
  return loadSessionStoreCompat(storePath)
}

function loadSessionStoreCompat(storePath: string) {
  return getKookRuntime().agent.session.loadSessionStore(storePath)
}

function resolvePluginTranscriptPath(
  route: ResolvedPluginSessionRoute,
  sessionId: string,
  sessionFile?: string,
): string {
  return getKookRuntime().agent.session.resolveSessionFilePath(sessionId, { sessionFile }, {
    agentId: route.agentId,
    sessionsDir: dirname(route.storePath),
  })
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
  const { deps, event, replyTarget } = ctx

  let route: ResolvedPluginSessionRoute
  try {
    route = resolvePluginSessionRoute(ctx)
  } catch (err) {
    await deps.deliverReply(replyTarget, `无法解析路由: ${err}`, event.msg_id)
    return
  }

  try {
    await resetPluginSession(route)
    await deps.deliverReply(replyTarget, `会话已重置`, event.msg_id)
  } catch (err) {
    await deps.deliverReply(replyTarget, `会话重置失败: ${err}`, event.msg_id)
  }
}
