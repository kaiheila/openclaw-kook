import { Type } from '@sinclair/typebox'
import { readFile } from 'fs/promises'
import { basename } from 'path'
import type { AnyAgentTool } from 'openclaw/plugin-sdk'

import type { RestClient } from '@kookapp/js-sdk'

import { getActiveClient, getFirstActiveClient } from './connection-manager'

// --- Action → RestClient method routing ---

type ActionHandler = (api: RestClient, params: any) => Promise<any>

const ACTION_MAP: Record<string, ActionHandler> = {
  // 服务器
  list_guilds: (api, p) => api.listGuilds(p),
  view_guild: (api, p) => api.viewGuild(p),
  list_guild_members: (api, p) => api.listGuildMembers(p),
  set_guild_nickname: (api, p) => api.setGuildNickname(p),

  // 频道
  list_channels: (api, p) => api.listChannels(p),
  view_channel: (api, p) => api.viewChannel(p),
  create_channel: (api, p) => api.createChannel(p),
  delete_channel: (api, p) => api.deleteChannel(p),

  // 服务器角色
  list_guild_roles: (api, p) => api.listGuildRoles(p),
  create_guild_role: (api, p) => api.createGuildRole(p),
  update_guild_role: (api, p) => api.updateGuildRole(p),
  delete_guild_role: (api, p) => api.deleteGuildRole(p),
  grant_role: (api, p) => api.grantRole(p),
  revoke_role: (api, p) => api.revokeRole(p),

  // 用户
  get_self_user: (api) => api.getSelfUser(),
  get_user: (api, p) => api.getUser(p),

  // 频道消息
  list_messages: (api, p) => api.listMessages(p),
  view_message: (api, p) => api.viewMessage(p),
  create_message: (api, p) => api.createMessage(p),
  add_reaction: (api, p) => api.addReaction(p),
  delete_reaction: (api, p) => api.deleteReaction(p),

  // 私信
  create_direct_message: (api, p) => api.createDirectMessage(p),
  list_direct_messages: (api, p) => api.listDirectMessages(p),

  // 私聊会话
  create_user_chat: (api, p) => api.createUserChat(p),
}

// upload_asset is special — reads a local file and builds FormData
async function handleUploadAsset(
  api: RestClient,
  params: { path: string; filename?: string },
): Promise<any> {
  if (!params.path) throw new Error('params.path is required for upload_asset')

  const buffer = await readFile(params.path)
  const filename = params.filename || basename(params.path)

  const blob = new Blob([buffer])
  const formData = new FormData()
  formData.append('file', blob, filename)
  return api.uploadAsset(formData as any)
}

const AVAILABLE_ACTIONS = [...Object.keys(ACTION_MAP), 'upload_asset'].join(', ')

const kookPlatformSchema = Type.Object({
  action: Type.String({
    description:
      `The API action to execute. Available actions: ${AVAILABLE_ACTIONS}`,
  }),
  params: Type.Optional(
    Type.Record(Type.String(), Type.Unknown(), {
      description: 'Parameters for the action (passed directly to the KOOK REST API)',
    }),
  ),
})

type ToolFactory = (ctx: { agentAccountId?: string }) => AnyAgentTool | null

export function createKookPlatformToolFactory(): ToolFactory {
  return (ctx) => {
    const tool: AnyAgentTool = {
      name: 'kook_platform',
      label: 'KOOK Platform',
      description:
        'Execute KOOK platform REST API operations. '
        + 'Supports guild/channel/role/user/message management. '
        + `Available actions: ${AVAILABLE_ACTIONS}`,
      parameters: kookPlatformSchema,

      async execute(_toolCallId, args) {
        // Resolve client: prefer the account from context, fall back to first active
        const client = ctx.agentAccountId
          ? getActiveClient(ctx.agentAccountId)
          : getFirstActiveClient()

        if (!client) {
          return {
            content: [{ type: 'text' as const, text: 'Error: No active KOOK client found' }],
            details: null,
          }
        }

        const handler = ACTION_MAP[args.action]
        if (!handler && args.action !== 'upload_asset') {
          return {
            content: [{
              type: 'text' as const,
              text: `Unknown action: ${args.action}. Available actions: ${AVAILABLE_ACTIONS}`,
            }],
            details: null,
          }
        }

        try {
          const result = args.action === 'upload_asset'
            ? await handleUploadAsset(client.api, args.params ?? {})
            : await handler(client.api, args.params ?? {})

          if (!result.success) {
            return {
              content: [{
                type: 'text' as const,
                text: `KOOK API error (code ${result.code}): ${result.message}`,
              }],
              details: result,
            }
          }

          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result.data, null, 2) }],
            details: result.data,
          }
        } catch (err) {
          return {
            content: [{
              type: 'text' as const,
              text: `Error executing ${args.action}: ${err instanceof Error ? err.message : String(err)}`,
            }],
            details: null,
          }
        }
      },
    }

    return tool
  }
}
