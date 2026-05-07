import { getActiveClient } from './connection-manager';
export const kookDirectoryAdapter = {
    async self(params) {
        const client = getActiveClient(params.accountId ?? 'default');
        if (!client?.me) {
            return null;
        }
        return {
            id: client.me.id,
            name: client.me.username,
            kind: 'user',
        };
    },
    async listGroups(params) {
        const client = getActiveClient(params.accountId ?? 'default');
        if (!client) {
            return [];
        }
        const response = await client.api.listGuilds({});
        if (!response.data?.items) {
            return [];
        }
        return response.data.items.map((guild) => ({
            id: guild.id,
            name: guild.name,
            kind: 'group',
        }));
    },
    async listGroupMembers(params) {
        const client = getActiveClient(params.accountId ?? 'default');
        if (!client) {
            return [];
        }
        const response = await client.api.listGuildMembers({
            guild_id: params.groupId,
        });
        if (!response.data?.items) {
            return [];
        }
        return response.data.items.map((member) => ({
            id: member.id,
            name: member.nickname ?? member.username,
            kind: 'user',
        }));
    },
};
//# sourceMappingURL=directory.js.map