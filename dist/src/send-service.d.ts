import type { KookClient } from '@kookapp/js-sdk';
export type SendTarget = {
    chatType: 'group';
    targetId: string;
} | {
    chatType: 'direct';
    targetId: string;
    userId: string;
};
export interface StreamingMessageHandle {
    initialize(): Promise<void>;
    appendText(content: string): Promise<void>;
    finalize(): Promise<void>;
}
export interface SendService {
    sendKMarkdown(target: SendTarget, text: string, replyToId?: string): Promise<void>;
    sendCard(target: SendTarget, cardJson: string, replyToId?: string): Promise<void>;
    sendMedia(target: SendTarget, mediaUrl: string, replyToId?: string): Promise<void>;
    createStreamingCard(target: SendTarget, replyToId?: string): StreamingMessageHandle;
    supportsStreaming(target: SendTarget): boolean;
}
export declare function createSendTarget(to: string, chatType?: 'group' | 'direct'): SendTarget;
export declare function createSendService(client: KookClient, botName?: string): SendService;
//# sourceMappingURL=send-service.d.ts.map