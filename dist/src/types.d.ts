export type KookDmPolicy = 'pairing' | 'allowlist' | 'open' | 'disabled';
export interface KookChannelConfig {
    botAuth?: string;
    botToken?: string;
    enabled?: boolean;
    baseUrl?: string;
    logLevel?: string;
    dmPolicy?: KookDmPolicy;
    allowFrom?: string[];
    trustedGuilds?: string[];
    acceptBotMessage?: boolean;
}
export interface KookAccount {
    botToken: string;
    enabled: boolean;
    baseUrl: string;
    logLevel: string;
    dmPolicy: KookDmPolicy;
    allowFrom: string[];
    trustedGuilds: string[];
    acceptBotMessage: boolean;
}
export declare function resolveKookConfig(cfg: any, accountId?: string | null): KookChannelConfig;
export declare function resolveKookAccount(cfg: any, accountId?: string | null): KookAccount;
export declare function listKookAccountIds(cfg: any): string[];
//# sourceMappingURL=types.d.ts.map