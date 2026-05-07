import type { ChannelStatusAdapter } from 'openclaw/plugin-sdk/channel-runtime';
import type { KookAccount } from './types';
export interface KookProbe {
    ok: boolean;
    error?: string | null;
    elapsedMs: number;
    bot?: {
        id?: string;
        username?: string;
    };
}
export declare const kookStatusAdapter: ChannelStatusAdapter<KookAccount, KookProbe>;
//# sourceMappingURL=status.d.ts.map