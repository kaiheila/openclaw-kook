import type {
  ChannelGatewayAdapter,
  ChannelGatewayContext,
} from 'openclaw/plugin-sdk'
import { DEFAULT_GROUP_HISTORY_LIMIT } from 'openclaw/plugin-sdk'

import { KookClient, KWSStates } from '@kookapp/js-sdk'

import type { KookAccount } from './types'
import type { HistoryEntry } from './inbound-handler'
import { createInboundHandler } from './inbound-handler'
import { createSendService } from './send-service'

// Store per-account KookClient instances for outbound use
const activeClients = new Map<string, KookClient>()

export function getActiveClient(accountId: string): KookClient | undefined {
  return activeClients.get(accountId)
}

export function getFirstActiveClient(): KookClient | undefined {
  for (const client of activeClients.values()) {
    return client
  }
  return undefined
}

export const kookGatewayAdapter: ChannelGatewayAdapter<KookAccount> = {
  async startAccount(ctx: ChannelGatewayContext<KookAccount>) {
    const { cfg, accountId, account, abortSignal, log } = ctx

    if (!account.botToken) {
      log?.error?.('No botToken configured for KOOK account')
      return
    }

    let client: KookClient

    try {
      client = new KookClient({
        botToken: account.botToken,
        baseUrl: account.baseUrl,
      })
    } catch (err) {
      log?.error?.(`Failed to create KOOK client: ${err}`)
      return
    }

    activeClients.set(accountId, client)

    // Update status
    ctx.setStatus({
      accountId,
      enabled: true,
      configured: true,
      running: true,
      connected: false,
      lastStartAt: Date.now(),
    })

    // Group history buffer for non-mentioned messages
    const groupHistories = new Map<string, HistoryEntry[]>()
    const historyLimit = Math.max(
      0,
      (cfg as any).channels?.kook?.historyLimit
        ?? (cfg as any).messages?.groupChat?.historyLimit
        ?? DEFAULT_GROUP_HISTORY_LIMIT,
    )

    // Connect to KOOK
    try {
      await client.connect()
    } catch (err) {
      log?.error?.(`Failed to connect KOOK client: ${err}`)
      activeClients.delete(accountId)
      ctx.setStatus({
        accountId,
        enabled: true,
        configured: true,
        running: false,
        connected: false,
        lastError: `Failed to connect: ${err}`,
        lastStopAt: Date.now(),
      })
      return
    }

    const botUserId = client.me?.id ?? ''
    const botName = client.me?.username ?? 'Bot'

    // Create send service (after connect so botName is available)
    const sendService = createSendService(client, botName)

    log?.info?.(`KOOK bot connected as ${botName} (${botUserId})`)

    ctx.setStatus({
      accountId,
      enabled: true,
      configured: true,
      running: true,
      connected: true,
      lastConnectedAt: Date.now(),
      name: botName,
    })

    // Create inbound handler
    const handler = createInboundHandler({
      cfg,
      botUserId,
      botName,
      accountId,
      log,
      groupHistories,
      historyLimit,
      acceptBotMessage: account.acceptBotMessage,
      trustedGuilds: account.trustedGuilds,
      deliverReply: sendService.sendKMarkdown.bind(sendService),
      deliverCardReply: sendService.sendCard.bind(sendService),
      createStreamingCard: sendService.createStreamingCard.bind(sendService),
    })

    // Register event listener
    client.on('textChannelEvent', handler)

    // Handle connection state changes
    // Heartbeat states (WaitingForHeartbeatResponse*) are part of normal
    // connected operation — don't report them as disconnected, otherwise
    // the health-monitor will restart the account every ~10 minutes.
    const CONNECTED_STATES: ReadonlySet<string> = new Set([
      KWSStates.Connected,
      KWSStates.WaitingForHeartbeatResponse,
      KWSStates.WaitingForHeartbeatResponse1stRetry,
    ])

    client.on('stateChange', (_from, to) => {
      try {
        const connected = CONNECTED_STATES.has(to)
        ctx.setStatus({
          ...ctx.getStatus(),
          connected,
          lastConnectedAt: connected ? Date.now() : ctx.getStatus().lastConnectedAt,
        })
      } catch (err) {
        log?.error?.(`Failed to update connection status: ${err}`)
      }
    })

    // Handle abort signal for graceful shutdown
    // IMPORTANT: startAccount must NOT return until abort — otherwise OpenClaw
    // treats the account as "exited" and triggers auto-restart.
    await new Promise<void>((resolve) => {
      abortSignal.addEventListener('abort', () => {
        try {
          log?.info?.('KOOK channel shutting down')
          client.disconnect()
          activeClients.delete(accountId)
          ctx.setStatus({
            ...ctx.getStatus(),
            running: false,
            connected: false,
            lastStopAt: Date.now(),
          })
        } catch (err) {
          log?.error?.(`Error during KOOK shutdown: ${err}`)
        }
        resolve()
      })
    })
  },

  async stopAccount(ctx: ChannelGatewayContext<KookAccount>) {
    try {
      const client = activeClients.get(ctx.accountId)
      if (client) {
        client.disconnect()
        activeClients.delete(ctx.accountId)
      }
      ctx.setStatus({
        ...ctx.getStatus(),
        running: false,
        connected: false,
        lastStopAt: Date.now(),
      })
    } catch (err) {
      ctx.log?.error?.(`Error stopping KOOK account: ${err}`)
    }
  },
}
