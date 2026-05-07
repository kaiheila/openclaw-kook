import { removingKMarkdownLabels } from '@kookapp/js-sdk';
export function buildMsgContext(params) {
    const { event, body, rawBody, envelope, sessionKey, accountId, chatType, mentioned, senderName, guildId, commandAuthorized, inboundHistory } = params;
    const cleanBody = stripKookMentions(rawBody);
    return {
        Body: envelope,
        RawBody: rawBody,
        BodyForAgent: cleanBody,
        CommandBody: cleanBody,
        BodyForCommands: cleanBody,
        CommandAuthorized: commandAuthorized,
        InboundHistory: inboundHistory,
        From: `kook:${event.author_id}`,
        To: chatType === 'direct' ? `kook:user:${event.author_id}` : `kook:channel:${event.target_id}`,
        SessionKey: sessionKey,
        AccountId: accountId,
        MessageSid: event.msg_id,
        ChatType: chatType,
        Provider: 'kook',
        Surface: 'kook',
        SenderName: senderName,
        SenderId: event.author_id,
        SenderUsername: event.extra?.author?.username,
        WasMentioned: mentioned,
        Timestamp: event.msg_timestamp,
        OriginatingChannel: 'kook',
        OriginatingTo: chatType === 'direct' ? `kook:user:${event.author_id}` : `kook:channel:${event.target_id}`,
        GroupSpace: guildId ?? undefined,
        GroupChannel: chatType === 'group' ? event.target_id : undefined,
    };
}
export function stripKookMentions(text) {
    // Remove (met)userId(met) patterns
    let result = removingKMarkdownLabels(text, ['met']);
    // Remove (rol)roleId(rol) patterns
    result = removingKMarkdownLabels(result, ['rol']);
    return result.trim();
}
export function formatKMarkdown(text) {
    // Convert headers to bold (KOOK KMarkdown doesn't support # headers well)
    let result = text.replace(/^###\s+(.+)$/gm, '**$1**');
    result = result.replace(/^##\s+(.+)$/gm, '**$1**');
    result = result.replace(/^#\s+(.+)$/gm, '**$1**');
    return result;
}
//# sourceMappingURL=message-utils.js.map