import type { OpenClawConfig, ReplyPayload, RuntimeEnv } from "openclaw/plugin-sdk";
import {
  applyAccountNameToChannelSection,
  DEFAULT_ACCOUNT_ID,
  deleteAccountFromConfigSection,
  formatPairingApproveHint,
  migrateBaseNameToDefaultAccount,
  normalizeAccountId,
  setAccountEnabledInConfigSection,
  type ChannelPlugin,
} from "openclaw/plugin-sdk";

import WebSocket from "ws";
import { IMSocket, SessionState } from "@kookapp/im-socket";

import { getKookRuntime } from "./runtime.js";
import type { KookConfig } from "./types.js";
import { probeKookAccount } from "./probe.js";

function normalizeAllowEntry(entry: string): string {
  return entry.trim().replace(/^(kook|user):/i, "").toLowerCase();
}

function getKookChatType(channelType: string): "direct" | "group" | "channel" {
  switch (channelType) {
    case "PERSON":
      return "direct";
    case "BROADCAST":
      return "group";
    default:
      return "channel";
  }
}

const meta = {
  id: "kook",
  label: "Kook",
  selectionLabel: "Kook",
  detailLabel: "Kook Bot",
  docsPath: "/channels/kook",
  blurb: "Kook chat platform",
  systemImage: "bubble.left.and.bubble.right",
  order: 70,
} as const;

type ResolvedKookAccount = {
  accountId: string;
  name?: string;
  enabled: boolean;
  token?: string;
  tokenSource?: string;
  allowedUserId?: string;
  config: Record<string, unknown>;
};

function resolveKookAccount(params: { cfg: OpenClawConfig; accountId?: string }): ResolvedKookAccount {
  const { cfg, accountId } = params;
  const resolvedAccountId = accountId ?? DEFAULT_ACCOUNT_ID;
  const kookCfg = cfg.channels?.kook as KookConfig | undefined;
  const account = kookCfg?.accounts?.[resolvedAccountId];

  const token = account?.token ?? kookCfg?.token;
  const tokenSource = (account?.token || kookCfg?.token) ? "config" : undefined;
  const name = account?.name ?? kookCfg?.name;
  const enabled = account?.enabled ?? kookCfg?.enabled ?? true;
  const allowedUserId = account?.allowedUserId ?? kookCfg?.allowedUserId;

  return {
    accountId: resolvedAccountId,
    name,
    enabled,
    token,
    tokenSource,
    allowedUserId,
    config: account?.config ?? {},
  };
}

function listKookAccountIds(cfg: OpenClawConfig): string[] {
  const kookCfg = cfg.channels?.kook as KookConfig | undefined;
  if (!kookCfg?.accounts) {
    return Object.keys(kookCfg || {}).length > 0 ? [DEFAULT_ACCOUNT_ID] : [];
  }
  return Object.keys(kookCfg.accounts);
}

function resolveDefaultKookAccountId(cfg: OpenClawConfig): string {
  const kookCfg = cfg.channels?.kook as KookConfig | undefined;
  if (kookCfg?.accounts && Object.keys(kookCfg.accounts).length > 0) {
    return Object.keys(kookCfg.accounts)[0];
  }
  return DEFAULT_ACCOUNT_ID;
}

async function sendMessageKook(
  targetId: string,
  content: string,
): Promise<{ ok: boolean; messageId?: string }> {
  const runtime = getKookRuntime();
  const config = runtime.config.loadConfig();
  const account = resolveKookAccount({ cfg: config });
  const token = account.token?.trim();

  if (!token) {
    throw new Error("Kook token is required");
  }

  try {
    const response = await fetch("https://www.kookapp.cn/api/v3/message/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bot ${token}`,
      },
      body: JSON.stringify({
        target_id: targetId,
        content,
        type: 9,
      }),
    });

    const data = await response.json();

    if (data.code === 0) {
      return { ok: true, messageId: data.data.msg_id };
    }

    return { ok: false };
  } catch (error) {
    throw new Error(`Failed to send Kook message: ${error}`);
  }
}

// Kook WebSocket 监控
async function monitorKookWebSocket(opts: {
  botToken: string;
  accountId: string;
  config: OpenClawConfig;
  abortSignal?: AbortSignal;
  onStatus: (status: Record<string, unknown>) => void;
  log: (...args: unknown[]) => void;
}): Promise<void> {
  const { botToken, accountId, abortSignal, onStatus, log } = opts;

  let selfUserId = "";

  const updateStatus = (patch: Record<string, unknown>) => {
    onStatus(patch);
  };

  const getSelfUserId = async (): Promise<string> => {
    const response = await fetch("https://www.kookapp.cn/api/v3/user/me", {
      headers: { Authorization: `Bot ${botToken}` },
    });
    const data = await response.json();
    if (data.code !== 0) {
      log(`Failed to get self user ID: ${data.message}`);
      return "";
    }
    return String(data.data.id ?? "");
  };

  const processEvent = async (event: { d: Record<string, unknown> }) => {
    const data = event.d;
    const channelType = data.channel_type as string;
    const type = data.type as number;
    const targetId = data.target_id as string;
    const authorId = data.author_id as string;
    const content = data.content as string;
    const msgId = data.msg_id as string;
    const extra = data.extra as Record<string, unknown>;

    const {
      code,
      guild_id,
      guild_type,
      channel_name,
      visible_only,
      mention,
      mention_no_at,
      mention_all,
      mention_roles,
      mention_here,
      nav_channels,
      kmarkdown,
      emoji,
      preview_content,
      channel_type,
      last_msg_content,
      send_msg_device
    } = extra;

    if (mention != selfUserId) return;
    if (type === 255) return;
    if (authorId === selfUserId) return;
    if (type !== 1 && type !== 9) return;

    const runtime = getKookRuntime();
    const cfg = runtime.config.loadConfig();
    const account = resolveKookAccount({ cfg });

    if (account.allowedUserId && account.allowedUserId.trim()) {
      if (authorId !== account.allowedUserId.trim()) {
        log(`Message from ${authorId} rejected: not in allowedUserId (${account.allowedUserId})`);
        return;
      }
    }

    const author = extra?.author as Record<string, unknown> | undefined;
    const senderName = (author?.username as string) ?? authorId;

    const chatType = getKookChatType(channelType);
    const bodyText = content.trim();
    if (!bodyText) return;

    const groupPolicy = (account.config.groupPolicy as string) ?? "allowlist";
    if (chatType !== "direct" && groupPolicy === "allowlist") {
      // 简化：允许所有消息
    }

    const fromLabel = chatType === "direct"
      ? `Kook user ${senderName}`
      : `Kook user ${senderName} in channel ${targetId}`;

    const route = runtime.channel.routing.resolveAgentRoute({
      cfg,
      channel: "kook",
      accountId,
      teamId: undefined,
      peer: {
        kind: chatType,
        id: chatType === "direct" ? authorId : targetId,
      },
    });

    const sessionKey = route.sessionKey;
    const to = chatType === "direct" ? `user:${authorId}` : `channel:${targetId}`;

    const ctxPayload = runtime.channel.reply.finalizeInboundContext({
      Body: `${bodyText}\n[kook message id: ${msgId} channel: ${targetId}]`,
      RawBody: bodyText,
      CommandBody: bodyText,
      From: `kook:${authorId}`,
      To: to,
      SessionKey: sessionKey,
      AccountId: route.accountId,
      ChatType: chatType,
      ConversationLabel: fromLabel,
      SenderName: senderName,
      SenderId: authorId,
      Provider: "kook" as const,
      Surface: "kook" as const,
      MessageSid: msgId,
      Timestamp: data.msg_timestamp as number,
    });

    const { dispatcher, replyOptions, markDispatchIdle } =
      runtime.channel.reply.createReplyDispatcherWithTyping({
        responsePrefix: "",
        humanDelay: runtime.channel.reply.resolveHumanDelayConfig(cfg, route.agentId),
        deliver: async (payload: ReplyPayload) => {
          const text = payload.text ?? "";
          const chunks = text.match(/.{1,2000}/g) ?? [text];
          for (const chunk of chunks) {
            if (!chunk) continue;
            await sendMessageKook(to.replace(/^(user|channel):/, ""), chunk);
          }
        },
        onError: (err, info) => {
          runtime.error?.(`Kook ${info.kind} reply failed: ${err}`);
        },
      });

    await runtime.channel.reply.dispatchReplyFromConfig({
      ctx: ctxPayload,
      cfg,
      dispatcher,
      replyOptions,
    });

    markDispatchIdle();
    updateStatus({ lastInboundAt: Date.now() });
  };

  // 获取机器人自身 ID
  selfUserId = await getSelfUserId();
  log(`Kook self user ID: ${selfUserId}`);

  const transport = new IMSocket({
    token: `Bot ${botToken}`,
    gatewayURL: "https://www.kookapp.cn",
    compress: 0,
    createSocket: (url: string) => new WebSocket(url) as any,
    gatewayProvider: async () => {
      const res = await fetch(
        "https://www.kookapp.cn/api/v3/gateway/index?compress=0",
        { headers: { Authorization: `Bot ${botToken}` } },
      );
      const json = await res.json();
      if (json.code !== 0) {
        throw new Error(`Failed to get gateway: ${json.message}`);
      }
      return { url: json.data.url };
    },
    logger: {
      log: (...args: unknown[]) => log("[im-socket]", ...args),
      warn: (...args: unknown[]) => log("[im-socket][warn]", ...args),
      error: (...args: unknown[]) => log("[im-socket][error]", ...args),
    },
  });

  transport.on("message", (frame: { s: number; sn: number; d: Record<string, unknown> }) => {
    processEvent(frame);
  });

  transport.on("statechange", ({ from, to }: { from: string; to: string }) => {
    updateStatus({ running: to === SessionState.connected });
    log(`Kook state: ${from} -> ${to}`);
  });

  transport.on("reconnect", () => {
    log("Kook server requested reconnect");
  });

  transport.on("error", (err: unknown) => {
    log(`Kook transport error: ${err}`);
  });

  updateStatus({ lastStartAt: Date.now(), running: true });
  log(`Kook provider started for account: ${accountId}`);
  transport.start();

  if (abortSignal) {
    abortSignal.addEventListener("abort", () => {
      transport.stop();
      updateStatus({ running: false, lastStopAt: Date.now() });
    }, { once: true });
  }
}

export const kookPlugin: ChannelPlugin<ResolvedKookAccount> = {
  id: "kook",
  meta,
  pairing: {
    idLabel: "kookUserId",
    normalizeAllowEntry: (entry) => normalizeAllowEntry(entry),
    notifyApproval: async ({ id }) => {
      console.log(`[kook] User ${id} approved for pairing`);
    },
  },
  capabilities: {
    chatTypes: ["direct", "channel"],
    media: true,
  },
  streaming: {
    blockStreamingCoalesceDefaults: { minChars: 1500, idleMs: 1000 },
  },
  reload: { configPrefixes: ["channels.kook"] },
  configSchema: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean" },
        token: { type: "string" },
        name: { type: "string" },
        allowedUserId: { type: "string" },
        dmPolicy: { type: "string", enum: ["open", "pairing", "allowlist"] },
        allowFrom: { type: "array", items: { type: "string" } },
        groupPolicy: { type: "string", enum: ["open", "allowlist", "disabled"] },
        groupAllowFrom: { type: "array", items: { type: "string" } },
        requireMention: { type: "boolean" },
        textChunkLimit: { type: "integer", minimum: 1 },
        accounts: {
          type: "object",
          additionalProperties: {
            type: "object",
            properties: {
              enabled: { type: "boolean" },
              token: { type: "string" },
              name: { type: "string" },
              allowedUserId: { type: "string" },
              config: { type: "object" },
            },
          },
        },
      },
    },
  },
  config: {
    listAccountIds: (cfg) => listKookAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveKookAccount({ cfg, accountId }),
    defaultAccountId: (cfg) => resolveDefaultKookAccountId(cfg),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg,
        sectionKey: "kook",
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg,
        sectionKey: "kook",
        accountId,
        clearBaseFields: ["token", "name"],
      }),
    isConfigured: (account) => Boolean(account.token?.trim()),
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(account.token?.trim()),
      tokenSource: account.tokenSource,
    }),
    resolveAllowFrom: () => [],
    formatAllowFrom: () => [],
  },
  security: {
    resolveDmPolicy: () => ({
      policy: "pairing" as const,
      allowFrom: [] as string[],
      policyPath: "channels.kook.dmPolicy",
      allowFromPath: "channels.kook.allowFrom",
      approveHint: formatPairingApproveHint("kook"),
      normalizeEntry: (raw) => normalizeAllowEntry(raw),
    }),
    collectWarnings: () => [],
  },
  groups: {
    resolveRequireMention: () => false,
  },
  messaging: {
    normalizeTarget: (target) => target.trim(),
    targetResolver: {
      looksLikeId: () => true,
      hint: "<channelId|user:ID>",
    },
  },
  outbound: {
    deliveryMode: "direct",
    chunker: (text, limit) => {
      const chunks = [];
      let remaining = text;
      while (remaining.length > limit) {
        chunks.push(remaining.slice(0, limit));
        remaining = remaining.slice(limit);
      }
      if (remaining) chunks.push(remaining);
      return chunks;
    },
    textChunkLimit: 2000,
    resolveTarget: ({ to }) => {
      const trimmed = to?.trim();
      if (!trimmed) {
        return {
          ok: false,
          error: new Error("Delivering to Kook requires --to <channelId|user:ID>"),
        };
      }
      return { ok: true, to: trimmed };
    },
    sendText: async ({ to, text }) => {
      const result = await sendMessageKook(to, text);
      return { channel: "kook", ...result };
    },
    sendMedia: async ({ to, text, mediaUrl }) => {
      const result = await sendMessageKook(to, text || mediaUrl);
      return { channel: "kook", ...result };
    },
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      connected: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
      lastInboundAt: null,
      lastOutboundAt: null,
    },
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      tokenSource: snapshot.tokenSource ?? "none",
      running: snapshot.running ?? false,
      connected: snapshot.connected ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
    }),
    probeAccount: async ({ account }) => {
      const token = account.token?.trim();
      if (!token) {
        return { ok: false, error: "bot token missing" };
      }
      return await probeKookAccount({ token });
    },
    buildAccountSnapshot: ({ account, runtime, probe }) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(account.token?.trim()),
      tokenSource: account.tokenSource,
      running: runtime?.running ?? false,
      connected: runtime?.connected ?? false,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
      probe,
      lastInboundAt: runtime?.lastInboundAt ?? null,
      lastOutboundAt: runtime?.lastOutboundAt ?? null,
    }),
  },
  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    applyAccountName: ({ cfg, accountId, name }) =>
      applyAccountNameToChannelSection({
        cfg,
        channelKey: "kook",
        accountId,
        name,
      }),
    validateInput: () => null,
    applyAccountConfig: ({ cfg, accountId, input }) => {
      const namedConfig = applyAccountNameToChannelSection({
        cfg,
        channelKey: "kook",
        accountId,
        name: input.name,
      });
      const next =
        accountId !== DEFAULT_ACCOUNT_ID
          ? migrateBaseNameToDefaultAccount({
              cfg: namedConfig,
              channelKey: "kook",
            })
          : namedConfig;

      if (accountId === DEFAULT_ACCOUNT_ID) {
        return {
          ...next,
          channels: {
            ...next.channels,
            kook: {
              ...next.channels?.kook,
              enabled: true,
              ...(input.useEnv ? {} : input.token ? { token: input.token } : {}),
            },
          },
        };
      }

      return {
        ...next,
        channels: {
          ...next.channels,
          kook: {
            ...next.channels?.kook,
            enabled: true,
            accounts: {
              ...next.channels?.kook?.accounts,
              [accountId]: {
                ...next.channels?.kook?.accounts?.[accountId],
                enabled: true,
                ...(input.token ? { token: input.token } : {}),
              },
            },
          },
        },
      };
    },
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      const token = account.token?.trim();

      if (!token) {
        throw new Error(`Kook token missing for account "${account.accountId}"`);
      }

      ctx.setStatus({
        accountId: account.accountId,
        running: true,
      });

      ctx.log?.info(`[${account.accountId}] Starting Kook provider`);

      // 启动 WebSocket 监控
      return monitorKookWebSocket({
        botToken: token,
        accountId: account.accountId,
        config: ctx.cfg,
        abortSignal: ctx.abortSignal,
        onStatus: (status) => ctx.setStatus({ accountId: account.accountId, ...status }),
        log: (...args) => ctx.log?.info(`[kook] ${args.join(" ")}`),
      });
    },
  },
};
