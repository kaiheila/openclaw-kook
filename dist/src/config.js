import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from 'openclaw/plugin-sdk/account-id';
import { listKookAccountIds, resolveKookAccount } from './types';
export const kookConfigAdapter = {
    listAccountIds(cfg) {
        return listKookAccountIds(cfg);
    },
    resolveAccount(cfg, accountId) {
        const id = normalizeAccountId(accountId);
        return resolveKookAccount(cfg, id);
    },
    defaultAccountId() {
        return DEFAULT_ACCOUNT_ID;
    },
    isEnabled(account) {
        return account.enabled;
    },
    isConfigured(account) {
        return account.botToken.length > 0;
    },
    describeAccount(account, cfg) {
        const configured = account.botToken.length > 0;
        const enabled = account.enabled;
        return {
            accountId: DEFAULT_ACCOUNT_ID,
            enabled,
            configured,
            name: 'KOOK',
        };
    },
};
//# sourceMappingURL=config.js.map