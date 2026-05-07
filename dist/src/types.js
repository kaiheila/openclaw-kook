import { isExperimentalFeaturesEnabled } from './beta';
export function resolveKookConfig(cfg, accountId) {
    const channels = cfg.channels ?? {};
    const section = channels.kook ?? {};
    if (accountId && accountId !== 'default') {
        const accounts = section.accounts ?? {};
        return accounts[accountId] ?? section;
    }
    return section;
}
export function resolveKookAccount(cfg, accountId) {
    const raw = resolveKookConfig(cfg, accountId);
    const betaEnabled = isExperimentalFeaturesEnabled();
    return {
        botToken: raw.botAuth ?? raw.botToken ?? '',
        enabled: raw.enabled !== false,
        baseUrl: raw.baseUrl ?? 'https://www.kookapp.cn',
        logLevel: raw.logLevel ?? 'info',
        dmPolicy: raw.dmPolicy ?? 'open',
        allowFrom: raw.allowFrom ?? [],
        trustedGuilds: betaEnabled ? (raw.trustedGuilds ?? []) : [],
        acceptBotMessage: raw.acceptBotMessage !== false,
    };
}
export function listKookAccountIds(cfg) {
    const channels = cfg.channels ?? {};
    const section = channels.kook ?? {};
    if (section.accounts) {
        return Object.keys(section.accounts);
    }
    if (section.botAuth || section.botToken) {
        return ['default'];
    }
    return [];
}
//# sourceMappingURL=types.js.map