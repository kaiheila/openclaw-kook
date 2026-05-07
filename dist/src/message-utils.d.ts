import type { KEvent, KTextChannelExtra } from '@kookapp/js-sdk';
interface InboundHistoryEntry {
    sender: string;
    body: string;
    timestamp?: number;
}
interface MsgContextLike extends Record<string, unknown> {
    Body?: string;
    RawBody?: string;
    BodyForAgent?: string;
    CommandBody?: string;
    BodyForCommands?: string;
    CommandAuthorized?: boolean;
    InboundHistory?: InboundHistoryEntry[];
    From?: string;
    To?: string;
    SessionKey?: string;
    AccountId?: string;
    MessageSid?: string;
    ChatType?: string;
    Provider?: string;
    Surface?: string;
    SenderName?: string;
    SenderId?: string;
    SenderUsername?: string;
    WasMentioned?: boolean;
    Timestamp?: number;
    OriginatingChannel?: string;
    OriginatingTo?: string;
    GroupSpace?: string;
    GroupChannel?: string;
}
interface BuildMsgContextParams {
    event: KEvent<KTextChannelExtra>;
    body: string;
    rawBody: string;
    envelope: string;
    sessionKey: string;
    accountId: string;
    chatType: 'direct' | 'group';
    mentioned: boolean;
    senderName: string;
    guildId: string | null;
    commandAuthorized: boolean;
    inboundHistory?: InboundHistoryEntry[];
}
export declare function buildMsgContext(params: BuildMsgContextParams): MsgContextLike;
export declare function stripKookMentions(text: string): string;
export declare function formatKMarkdown(text: string): string;
export {};
//# sourceMappingURL=message-utils.d.ts.map