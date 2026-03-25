import type { KookClient, KResponseExt, CreateMessageResult } from '@kookapp/js-sdk'
import { CardBuilder, StreamingCard } from '@kookapp/js-sdk'

import { formatKMarkdown } from './message-utils'

export type SendTarget =
  | { chatType: 'group'; targetId: string }
  | { chatType: 'direct'; targetId: string; userId: string }

export interface SendService {
  sendKMarkdown(target: SendTarget, text: string, replyToId?: string): Promise<void>
  sendCard(target: SendTarget, cardJson: string, replyToId?: string): Promise<void>
  sendMedia(target: SendTarget, mediaUrl: string, replyToId?: string): Promise<void>
  createStreamingCard(target: SendTarget, replyToId?: string): StreamingCard
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

      const card = CardBuilder.fromTemplate({ initialCard: { theme: 'none' } })
      card.addKMarkdownText(kmd)

      await sendCardPayload(target, card.build(), replyToId)
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
      return target.chatType === 'group'
    },
  }
}
