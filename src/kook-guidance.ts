/**
 * Condensed KOOK platform knowledge injected into the agent's system prompt.
 *
 * Only includes information the AI needs to USE the kook_platform tool correctly:
 * - Available actions with their required/optional params
 * - Message types, KMarkdown syntax, card message format
 *
 * Internal details (WebSocket, rate limiting, etc.) are omitted.
 */
export const KOOK_PLATFORM_GUIDANCE = `\
## KOOK Platform — kook_platform Tool Reference

You have a \`kook_platform\` tool to interact with KOOK (a Discord-like messaging platform).
Call it with \`{ action, params }\`.

### Message Types (type field)
| Value | Type | Notes |
|-------|------|-------|
| 1 | Text | Plain text |
| 9 | KMarkdown | Rich text (preferred for sending) |
| 10 | Card | Card message (JSON array as content) |

### KMarkdown Syntax
\`**bold**\` \`*italic*\` \`~~strike~~\` \`\\\`code\\\`\`
\`[text](url)\` link
\`(met)userId(met)\` @user · \`(met)all(met)\` @everyone · \`(met)here(met)\` @online
\`(rol)roleId(rol)\` @role · \`(chn)channelId(chn)\` #channel
\`(emj)name(emj)[emojiId]\` custom emoji · \`:emoji:\` server emoji
\`> quote\` · \`---\` divider · \`(spl)spoiler(spl)\` · \`(ins)underline(ins)\`

### Card Message Format
content must be a JSON string of an array:
\`[{ "type":"card", "theme":"secondary", "size":"lg", "modules":[...] }]\`

Module types: section, header, divider, image-group, container, context, action-group, file, countdown, invite.
Section example: \`{ "type":"section", "text":{ "type":"kmarkdown", "content":"text" } }\`
Button example (in action-group): \`{ "type":"button", "theme":"primary", "value":"val", "text":{ "type":"plain-text", "content":"Click" } }\`

### Actions Quick Reference

**Guild (服务器)**
- \`list_guilds\` — params: page?, page_size?, sort?
- \`view_guild\` — params: guild_id (required)
- \`list_guild_members\` — params: guild_id (required), channel_id?, search?, role_id?, page?, page_size?
- \`set_guild_nickname\` — params: guild_id (required), nickname?, user_id?

**Channel (频道)**
- \`list_channels\` — params: guild_id (required), type?, page?, page_size?
- \`view_channel\` — params: target_id (required)
- \`create_channel\` — params: guild_id (required), name (required), type?, parent_id?
- \`delete_channel\` — params: channel_id (required)

**Roles (角色)**
- \`list_guild_roles\` — params: guild_id (required), page?, page_size?
- \`create_guild_role\` — params: guild_id (required), name?
- \`update_guild_role\` — params: guild_id (required), role_id (required), name?, color?, hoist?, mentionable?, permissions?
- \`delete_guild_role\` — params: guild_id (required), role_id (required)
- \`grant_role\` / \`revoke_role\` — params: guild_id (required), user_id (required), role_id (required)

**User (用户)**
- \`get_self_user\` — no params
- \`get_user\` — params: user_id (required), guild_id?

**Messages (消息)**
- \`list_messages\` — params: target_id (required, channel_id), msg_id?, pin?, flag?, page_size?
- \`view_message\` — params: msg_id (required)
- \`create_message\` — params: type (required), target_id (required, channel_id), content (required), quote?, temp_target_id?
- \`add_reaction\` / \`delete_reaction\` — params: msg_id (required), emoji (required)

**Direct Messages (私信)**
- \`list_direct_messages\` — params: chat_code?, target_id?, msg_id?, flag?, page_size?
- \`create_direct_message\` — params: type (required), content (required), target_id or chat_code (one required), quote?

**User Chat (私聊会话)**
- \`create_user_chat\` — params: target_id (required)

**Asset (资源)**
- \`upload_asset\` — params: path (required, local file path), filename? — returns { url } (KOOK CDN URL)
`
