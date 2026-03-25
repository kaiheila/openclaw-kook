import type { KookClient, KResponseExt, CreateMessageResult } from '@kookapp/js-sdk'
import { CardBuilder, StreamingCard } from '@kookapp/js-sdk'

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

      if (target.chatType === 'direct') {
        const placeholder = `*${displayName} 正在输入...*`
        let messageId: string | null = null
        let initialized = false
        let accumulatedContent = ''

        const initializePlaceholder = async () => {
          if (initialized) {
            return
          }

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
          initialized = true
        }

        return {
          async initialize() {
            await initializePlaceholder()
          },

          async appendText(content) {
            accumulatedContent += content
            if (!messageId) {
              await initializePlaceholder()
            }
            if (!messageId) {
              throw new Error(`Missing KOOK DM placeholder message for user ${target.userId}`)
            }
            await client.api.updateDirectMessage({
              msg_id: messageId,
              content: buildTextCard(accumulatedContent),
            })
          },

          async finalize() {},
        }
      }

      return new StreamingCard({
        api: client.api,
        targetId: target.targetId,
        quoteMessageId: replyToId,
        maxLength: 4500,
        throttleMs: 300,
        initialCard: (card) => {
          card.addKMarkdownText(`*${displayName} 正在输入...*`)
          return card
        },
        cardPreprocessor: (card) => {
          card.undoLastAdd()
          return card
        },
      })
    },

    supportsStreaming(target) {
      return target.chatType === 'group' || target.chatType === 'direct'
    },
  }
}
