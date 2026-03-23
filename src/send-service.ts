import type { KookClient, KResponseExt } from '@kookapp/js-sdk'
import { CardBuilder, StreamingCard } from '@kookapp/js-sdk'

import { formatKMarkdown } from './message-utils'

export interface SendService {
  sendKMarkdown(channelId: string, text: string, replyToId?: string): Promise<void>
  sendCard(channelId: string, cardJson: string, replyToId?: string): Promise<void>
  sendMedia(channelId: string, mediaUrl: string, replyToId?: string): Promise<void>
  createStreamingCard(channelId: string, replyToId?: string): StreamingCard
}

export function createSendService(client: KookClient, botName?: string): SendService {
  return {
    async sendKMarkdown(channelId, text, replyToId) {
      const kmd = formatKMarkdown(text)

      // Use card message for better formatting
      const card = CardBuilder.fromTemplate({ initialCard: { theme: 'none' } })
      card.addKMarkdownText(kmd)

      await client.api.createMessage({
        target_id: channelId,
        content: card.build(),
        type: 10,
        quote: replyToId,
      })
    },

    async sendCard(channelId, cardJson, replyToId) {
      await client.api.createMessage({
        target_id: channelId,
        content: cardJson,
        type: 10,
        quote: replyToId,
      })
    },

    async sendMedia(channelId, mediaUrl, replyToId) {
      // Build card with media
      const card = CardBuilder.fromTemplate({ initialCard: { theme: 'none' } })
      card.addImage(mediaUrl)

      await client.api.createMessage({
        target_id: channelId,
        content: card.build(),
        type: 10,
        quote: replyToId,
      })
    },

    createStreamingCard(channelId, replyToId) {
      const displayName = botName ?? 'Bot'
      return new StreamingCard({
        api: client.api,
        targetId: channelId,
        quoteMessageId: replyToId,
        maxLength: 4500,
        throttleMs: 300,
        initialCard: (card) => {
          card.addKMarkdownText(`*${displayName} 正在输入...*`)
          return card
        },
        cardPreprocessor: (card) => {
          // Remove the "typing" placeholder before first real content
          card.undoLastAdd()
          return card
        },
      })
    },
  }
}
