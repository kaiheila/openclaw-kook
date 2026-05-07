import { createDefaultChannelRuntimeState, buildBaseAccountStatusSnapshot, } from 'openclaw/plugin-sdk/status-helpers';
import { getActiveClient } from './connection-manager';
export const kookStatusAdapter = {
    defaultRuntime: createDefaultChannelRuntimeState('default', {
        connected: false,
    }),
    async probeAccount(params) {
        const start = Date.now();
        try {
            const accountId = params.account.accountId ?? 'default';
            const client = getActiveClient(accountId);
            if (!client) {
                return {
                    ok: false,
                    error: 'No active KOOK client',
                    elapsedMs: Date.now() - start,
                };
            }
            const response = await client.api.getSelfUser();
            const elapsedMs = Date.now() - start;
            if (!response.data) {
                return {
                    ok: false,
                    error: response.message ?? 'Failed to get self user',
                    elapsedMs,
                };
            }
            return {
                ok: true,
                elapsedMs,
                bot: {
                    id: response.data.id,
                    username: response.data.username,
                },
            };
        }
        catch (err) {
            return {
                ok: false,
                error: `Probe failed: ${err}`,
                elapsedMs: Date.now() - start,
            };
        }
    },
    buildAccountSnapshot(params) {
        const { account, runtime, probe } = params;
        const accountId = runtime?.accountId ?? 'default';
        const base = buildBaseAccountStatusSnapshot({
            account: {
                accountId,
                name: runtime?.name ?? probe?.bot?.username ?? 'KOOK Bot',
                enabled: account.enabled,
                configured: account.botToken.length > 0,
            },
            runtime,
            probe,
        });
        return {
            ...base,
            connected: runtime?.connected ?? false,
            lastConnectedAt: runtime?.lastConnectedAt ?? null,
        };
    },
};
//# sourceMappingURL=status.js.map