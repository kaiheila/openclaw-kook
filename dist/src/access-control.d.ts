import { resolveDmGroupAccessWithLists } from 'openclaw/plugin-sdk/channel-policy';
import type { ChannelSecurityAdapter } from 'openclaw/plugin-sdk/channel-runtime';
import type { KookAccount } from './types';
export declare function normalizeKookAllowEntry(raw: string): string;
export declare function isKookSenderAllowed(entries: string[], userId: string): boolean;
export declare function resolveKookAccess(params: {
    isGroup: boolean;
    dmPolicy: KookAccount['dmPolicy'];
    allowFrom: string[];
    storeAllowFrom: string[];
    userId: string;
}): ReturnType<typeof resolveDmGroupAccessWithLists>;
export declare const kookSecurityAdapter: ChannelSecurityAdapter<KookAccount>;
//# sourceMappingURL=access-control.d.ts.map