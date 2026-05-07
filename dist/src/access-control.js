import { DM_GROUP_ACCESS_REASON, resolveDmGroupAccessWithLists } from 'openclaw/plugin-sdk/channel-policy';
export function normalizeKookAllowEntry(raw) {
    return raw.trim();
}
export function isKookSenderAllowed(entries, userId) {
    const rawId = userId.trim();
    if (!rawId) {
        return false;
    }
    return entries.includes('*') || entries.includes(rawId);
}
export function resolveKookAccess(params) {
    const access = resolveDmGroupAccessWithLists({
        isGroup: params.isGroup,
        dmPolicy: params.dmPolicy,
        groupPolicy: 'allowlist',
        allowFrom: params.allowFrom,
        storeAllowFrom: params.storeAllowFrom,
        groupAllowFromFallbackToAllowFrom: true,
        isSenderAllowed: (entries) => isKookSenderAllowed(entries, params.userId),
    });
    if (params.isGroup || params.dmPolicy !== 'open' || isKookSenderAllowed(access.effectiveAllowFrom, params.userId)) {
        return access;
    }
    return {
        ...access,
        decision: 'block',
        reasonCode: DM_GROUP_ACCESS_REASON.DM_POLICY_NOT_ALLOWLISTED,
        reason: 'dmPolicy=open (not allowlisted)',
    };
}
export const kookSecurityAdapter = {
    resolveDmPolicy(ctx) {
        const isPairing = ctx.account.dmPolicy === 'pairing';
        return {
            policy: ctx.account.dmPolicy,
            allowFrom: ctx.account.allowFrom,
            allowFromPath: 'channels.kook.allowFrom',
            approveHint: isPairing
                ? '使用 OpenClaw 的 pairing approve 流程批准该 KOOK 用户，或手动将其添加到 channels.kook.allowFrom'
                : '在 openclaw.json 的 channels.kook.allowFrom 中添加 KOOK 用户 ID；如需公开开放，请显式添加 *',
            normalizeEntry: normalizeKookAllowEntry,
        };
    },
};
//# sourceMappingURL=access-control.js.map