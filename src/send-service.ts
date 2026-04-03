import type { KookClient, KResponseExt, CreateMessageResult } from '@kookapp/js-sdk'
import { CardBuilder } from '@kookapp/js-sdk'

import { formatKMarkdown } from './message-utils'

export type SendTarget =
  | { chatType: 'group'; targetId: string }
  | { chatType: 'direct'; targetId: string; userId: string }

export interface StreamingMessageHandle {
  initialize(): Promise<void>
  appendText(content: string): Promise<void>
  finalize(): Promise<void>
}

export interface SendService {
  sendKMarkdown(target: SendTarget, text: string, replyToId?: string): Promise<void>
  sendCard(target: SendTarget, cardJson: string, replyToId?: string): Promise<void>
  sendMedia(target: SendTarget, mediaUrl: string, replyToId?: string): Promise<void>
  createStreamingCard(target: SendTarget, replyToId?: string): StreamingMessageHandle
  supportsStreaming(target: SendTarget): boolean
}

const STREAM_CARD_MAX_LENGTH = 4500
const STREAM_UPDATE_THROTTLE_MS = 300

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function createSendTarget(to: string, chatType: 'group' | 'direct' = 'group'): SendTarget {
  const raw = to.replace(/^kook:/, '')
  if (raw.startsWith('user:')) {
    const userId = raw.slice('user:'.length)
    return { chatType: 'direct', targetId: userId, userId }
  }
  if (raw.startsWith('channel:')) {
    return { chatType: 'group', targetId: raw.slice('channel:'.length) }
  }
  if (chatType === 'direct') {
    return { chatType: 'direct', targetId: raw, userId: raw }
  }
  return { chatType: 'group', targetId: raw }
}

export function createSendService(client: KookClient, botName?: string): SendService {
  const ensureDirectChat = async (userId: string): Promise<string> => {
    const response = await client.api.createUserChat({ target_id: userId })
    const chatCode = response.data?.code
    if (!chatCode) {
      throw new Error(`Failed to create KOOK DM chat for user ${userId}`)
    }
    return chatCode
  }

  const buildTextCard = (text: string): string => {
    const card = CardBuilder.fromTemplate({ initialCard: { theme: 'none' } })
    card.addKMarkdownText(text)
    return card.build()
  }

  const sendTextPayload = async (target: SendTarget, text: string, replyToId?: string): Promise<void> => {
    if (target.chatType === 'direct') {
      const chatCode = await ensureDirectChat(target.userId)
      await client.api.createDirectMessage({
        chat_code: chatCode,
        content: text,
        type: 9,
        quote: replyToId,
      })
      return
    }

    await client.api.createMessage({
      target_id: target.targetId,
      content: text,
      type: 9,
      quote: replyToId,
    })
  }

  const sendCardPayload = async (
    target: SendTarget,
    content: string,
    replyToId?: string,
  ): Promise<KResponseExt<CreateMessageResult>> => {
    if (target.chatType === 'direct') {
      const chatCode = await ensureDirectChat(target.userId)
      return await client.api.createDirectMessage({
        chat_code: chatCode,
        content,
        type: 10,
        quote: replyToId,
      })
    }

    return await client.api.createMessage({
      target_id: target.targetId,
      content,
      type: 10,
      quote: replyToId,
    })
  }

  return {
    async sendKMarkdown(target, text, replyToId) {
      const kmd = formatKMarkdown(text)
      await sendCardPayload(target, buildTextCard(kmd), replyToId)
    },

    async sendCard(target, cardJson, replyToId) {
      await sendCardPayload(target, cardJson, replyToId)
    },

    async sendMedia(target, mediaUrl, replyToId) {
      const card = CardBuilder.fromTemplate({ initialCard: { theme: 'none' } })
      card.addImage(mediaUrl)

      await sendCardPayload(target, card.build(), replyToId)
    },

    createStreamingCard(target, replyToId) {
      const displayName = botName ?? 'Bot'
      const placeholder = `*${displayName} 正在输入...*`
      const fallbackNotice = '*回复较长，后续改用普通文字消息发送。*'
      let messageId: string | null = null
      let initialized = false
      let accumulatedContent = ''
      let streamingDisabled = false
      let lastUpdateAt = 0

      const createPlaceholder = async () => {
        if (initialized) {
          return
        }

        if (target.chatType === 'direct') {
          const chatCode = await ensureDirectChat(target.userId)
          const response = await client.api.createDirectMessage({
            chat_code: chatCode,
            content: buildTextCard(placeholder),
            type: 10,
            quote: replyToId,
          })
          messageId = response.data?.msg_id ?? null
          if (!messageId) {
            throw new Error(`Failed to create KOOK DM placeholder message for user ${target.userId}`)
          }
        } else {
          const response = await client.api.createMessage({
            target_id: target.targetId,
            content: buildTextCard(placeholder),
            type: 10,
            quote: replyToId,
          })
          messageId = response.data?.msg_id ?? null
          if (!messageId) {
            throw new Error(`Failed to create KOOK placeholder message for channel ${target.targetId}`)
          }
        }

        initialized = true
      }

      const sendFallbackText = async (text: string) => {
        if (!text.trim()) {
          return
        }
        await sendTextPayload(target, text, replyToId)
      }

      const markStreamingDisabled = async () => {
        streamingDisabled = true

        if (!messageId) {
          return
        }

        const noticeCard = buildTextCard(fallbackNotice)
        try {
          if (target.chatType === 'direct') {
            await client.api.updateDirectMessage({
              msg_id: messageId,
              content: noticeCard,
            })
          } else {
            await client.api.updateMessage({
              msg_id: messageId,
              content: noticeCard,
              extra: {
                type: 10,
                target_id: target.targetId,
              },
            })
          }
        } catch {
          // Ignore notice update errors and continue with plain-text fallback.
        }
      }

      const updateExistingMessage = async () => {
        if (!messageId) {
          throw new Error(`Missing KOOK placeholder message for ${target.chatType} target ${target.targetId}`)
        }

        const cardContent = buildTextCard(accumulatedContent)
        if (cardContent.length >= STREAM_CARD_MAX_LENGTH) {
          await markStreamingDisabled()
          await sendFallbackText(accumulatedContent)
          return
        }

        if (target.chatType === 'direct') {
          await client.api.updateDirectMessage({
            msg_id: messageId,
            content: cardContent,
          })
          return
        }

        await client.api.updateMessage({
          msg_id: messageId,
          content: cardContent,
          extra: {
            type: 10,
            target_id: target.targetId,
          },
        })
      }

      return {
        async initialize() {
          await createPlaceholder()
        },

        async appendText(content) {
          if (streamingDisabled) {
            await sendFallbackText(content)
            return
          }

          accumulatedContent += content
          if (!messageId) {
            await createPlaceholder()
          }

          const now = Date.now()
          const waitMs = STREAM_UPDATE_THROTTLE_MS - (now - lastUpdateAt)
          if (waitMs > 0) {
            await sleep(waitMs)
          }

          try {
            await updateExistingMessage()
          } catch {
            await markStreamingDisabled()
            await sendFallbackText(accumulatedContent)
          }
          lastUpdateAt = Date.now()
        },

        async finalize() {},
      }
    },

    supportsStreaming(target) {
      return target.chatType === 'group' || target.chatType === 'direct'
    },
  }
}
