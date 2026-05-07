import type { ChannelGatewayAdapter } from 'openclaw/plugin-sdk/channel-runtime';
import { KookClient } from '@kookapp/js-sdk';
import type { KookAccount } from './types';
export declare function getActiveClient(accountId: string): KookClient | undefined;
export declare function getFirstActiveClient(): KookClient | undefined;
export declare const kookGatewayAdapter: ChannelGatewayAdapter<KookAccount>;
//# sourceMappingURL=connection-manager.d.ts.map