import type {
  KEvent,
  KTextChannelExtra,
} from '@kookapp/js-sdk'

import { extractContent, removingKMarkdownLabels } from '@kookapp/js-sdk'

interface InboundHistoryEntry {
  sender: string
  body: string
  timestamp?: number
}

interface MsgContextLike extends Record<string, unknown> {
  Body?: string
  RawBody?: string
  BodyForAgent?: string
  CommandBody?: string
  BodyForCommands?: string
  CommandAuthorized?: boolean
  InboundHistory?: InboundHistoryEntry[]
  From?: string
  To?: string
  SessionKey?: string
  AccountId?: string
  MessageSid?: string
  ChatType?: string
  Provider?: string
  Surface?: string
  SenderName?: string
  SenderId?: string
  SenderUsername?: string
  WasMentioned?: boolean
  Timestamp?: number
  OriginatingChannel?: string
  OriginatingTo?: string
  GroupSpace?: string
  GroupChannel?: string
}

interface BuildMsgContextParams {
  event: KEvent<KTextChannelExtra>
  body: string
  rawBody: string
  envelope: string
  sessionKey: string
  accountId: string
  chatType: 'direct' | 'group'
  mentioned: boolean
  senderName: string
  guildId: string | null
  commandAuthorized: boolean
  inboundHistory?: InboundHistoryEntry[]
}

export function buildMsgContext(params: BuildMsgContextParams): MsgContextLike {
  const { event, body, rawBody, envelope, sessionKey, accountId, chatType, mentioned, senderName, guildId, commandAuthorized, inboundHistory } = params

  const cleanBody = stripKookMentions(rawBody)

  return {
    Body: envelope,
    RawBody: rawBody,
    BodyForAgent: cleanBody,
    CommandBody: cleanBody,
    BodyForCommands: cleanBody,
    CommandAuthorized: commandAuthorized,
    InboundHistory: inboundHistory,
    From: `kook:${event.author_id}`,
    To: `kook:${event.target_id}`,
    SessionKey: sessionKey,
    AccountId: accountId,
    MessageSid: event.msg_id,
    ChatType: chatType,
    Provider: 'kook',
    Surface: 'kook',
    SenderName: senderName,
    SenderId: event.author_id,
    SenderUsername: event.extra?.author?.username,
    WasMentioned: mentioned,
    Timestamp: event.msg_timestamp,
    OriginatingChannel: 'kook',
    OriginatingTo: `kook:${event.target_id}`,
    GroupSpace: guildId ?? undefined,
    GroupChannel: chatType === 'group' ? event.target_id : undefined,
  }
}

export function stripKookMentions(text: string): string {
  // Remove (met)userId(met) patterns
  let result = removingKMarkdownLabels(text, ['met'])

  // Remove (rol)roleId(rol) patterns
  result = removingKMarkdownLabels(result, ['rol'])

  return result.trim()
}

export function formatKMarkdown(text: string): string {
  // Convert headers to bold (KOOK KMarkdown doesn't support # headers well)
  let result = text.replace(/^###\s+(.+)$/gm, '**$1**')
  result = result.replace(/^##\s+(.+)$/gm, '**$1**')
  result = result.replace(/^#\s+(.+)$/gm, '**$1**')

  return result
}
