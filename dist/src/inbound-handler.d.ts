import type { ChannelLogSink } from 'openclaw/plugin-sdk/channel-runtime';
import type { OpenClawConfig } from 'openclaw/plugin-sdk/core';
import type { KEvent, KTextChannelExtra } from '@kookapp/js-sdk';
import type { StreamingMessageHandle } from './send-service';
import type { SendTarget } from './send-service';
export interface HistoryEntry {
    sender: string;
    body: string;
    timestamp?: number;
    messageId?: string;
}
interface InboundHandlerDeps {
    cfg: OpenClawConfig;
    botUserId: string;
    botName: string;
    accountId: string;
    log?: ChannelLogSink;
    groupHistories: Map<string, HistoryEntry[]>;
    historyLimit: number;
    acceptBotMessage: boolean;
    dmPolicy: 'pairing' | 'allowlist' | 'open' | 'disabled';
    allowFrom: string[];
    trustedGuilds: string[];
    isUserInTrustedGuilds: (userId: string, guildIds: string[]) => Promise<boolean>;
    deliverReply: (target: SendTarget, text: string, replyToId?: string) => Promise<void>;
    deliverCardReply: (target: SendTarget, cardJson: string, replyToId?: string) => Promise<void>;
    createStreamingCard: (target: SendTarget, replyToId?: string) => StreamingMessageHandle;
    supportsStreaming: (target: SendTarget) => boolean;
}
export declare function createInboundHandler(deps: InboundHandlerDeps): (event: KEvent<KTextChannelExtra>) => Promise<void>;
export {};
//# sourceMappingURL=inbound-handler.d.ts.map