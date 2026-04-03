import { Type } from '@sinclair/typebox'
import { readFile } from 'fs/promises'
import { basename } from 'path'
import type { AnyAgentTool } from 'openclaw/plugin-sdk/core'

import type { RestClient } from '@kookapp/js-sdk'

import { getActiveClient } from './connection-manager'

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

  // 自定义请求
  raw_request: (api, p) => {
    if (!p.path) {
      return Promise.resolve({ success: false, code: 400, message: 'params.path is required for raw_request', data: null })
    }
    const method = (p.method ?? 'GET').toUpperCase() as 'GET' | 'POST' | 'PUT' | 'DELETE'
    const payload = method === 'GET' ? p.query : { ...p.query, ...p.body }
    return api.request(p.path, method, payload)
  },
}

// upload_asset is special — reads a local file and builds FormData
async function handleUploadAsset(api: RestClient, params: { path: string; filename?: string }): Promise<any> {
  if (!params.path) {
    return { success: false, code: 400, message: 'params.path is required for upload_asset', data: null }
  }

  const buffer = await readFile(params.path)
  const filename = params.filename || basename(params.path)

  const blob = new Blob([buffer])
  const formData = new FormData()
  formData.append('file', blob, filename)
  return api.uploadAsset(formData as any)
}

const AVAILABLE_ACTIONS = [...Object.keys(ACTION_MAP), 'upload_asset'].sort().join(', ')
const KOOK_TOOL_TIMEOUT_MS = 10_000
const KOOK_UPLOAD_TIMEOUT_MS = 20_000

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeoutMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(onTimeoutMessage))
    }, timeoutMs)

    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

const kookPlatformSchema = Type.Object({
  action: Type.String({
    description: `The API action to execute. Available actions: ${AVAILABLE_ACTIONS}`,
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
        'Execute KOOK platform REST API operations. ' +
        'Supports guild/channel/role/user/message management. ' +
        `Available actions: ${AVAILABLE_ACTIONS}`,
      parameters: kookPlatformSchema,

      async execute(_toolCallId, args) {
        if (!ctx.agentAccountId) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Error: kook_platform requires a bound KOOK account context; refusing to fall back to another active client.',
              },
            ],
            details: {
              success: false,
              reason: 'missing_agent_account_id',
            },
          }
        }

        const client = getActiveClient(ctx.agentAccountId)

        if (!client) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error: No active KOOK client found for account ${ctx.agentAccountId}. The bot may be disconnected, the account context may be wrong, or the bot token may be invalid.`,
              },
            ],
            details: {
              success: false,
              reason: 'inactive_or_missing_client',
              accountId: ctx.agentAccountId,
            },
          }
        }

        const handler = ACTION_MAP[args.action]
        if (!handler && args.action !== 'upload_asset') {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Unknown action: ${args.action}. Available actions: ${AVAILABLE_ACTIONS}`,
              },
            ],
            details: null,
          }
        }

        try {
          const timeoutMs = args.action === 'upload_asset' ? KOOK_UPLOAD_TIMEOUT_MS : KOOK_TOOL_TIMEOUT_MS
          const result = await withTimeout(
            args.action === 'upload_asset'
              ? handleUploadAsset(client.api, args.params ?? {})
              : handler(client.api, args.params ?? {}),
            timeoutMs,
            `KOOK API request timed out after ${timeoutMs}ms while executing ${args.action}`,
          )

          if (!result.success) {
            const isAuthError = result.code === 401 || /unauthorized|auth|token/i.test(String(result.message ?? ''))
            return {
              content: [
                {
                  type: 'text' as const,
                  text: isAuthError
                    ? `KOOK API auth error (code ${result.code}): ${result.message}. Account=${ctx.agentAccountId}. This usually means the bound KOOK bot token is invalid, expired, missing permissions, or the request is being made under the wrong account context.`
                    : `KOOK API error (code ${result.code}): ${result.message}`,
                },
              ],
              details: {
                ...result,
                accountId: ctx.agentAccountId,
                authError: isAuthError,
              },
            }
          }

          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result.data, null, 2) }],
            details: result.data,
          }
        } catch (err) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error executing ${args.action}: ${err instanceof Error ? err.message : String(err)}`,
              },
            ],
            details: null,
            success: false,
          }
        }
      },
    }

    return tool
  }
}
