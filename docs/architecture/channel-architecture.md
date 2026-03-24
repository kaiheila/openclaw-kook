# Channel Architecture

> When to read: 需要理解 KOOK 通道插件的整体架构、模块关系、生命周期时

## Overview

moltbot-kook 是一个 OpenClaw 通道插件，通过 WebSocket 连接 KOOK 平台，实现 AI agent 与 KOOK 用户的消息收发。

## Core Modules

### src/channel.ts -- 通道定义
- 定义 `kookPlugin` 插件对象
- 导出所有 adapter（config、gateway、security、groups、mentions、messaging、outbound、directory、status）
- `reload.configPrefixes: ['channels.kook']` -- 配置热重载

### src/connection-manager.ts -- 连接管理
- 使用 `@kookapp/js-sdk` 的 `KookClient`
- `startAccount()` 异步启动，**必须保持直到 abortSignal abort**
- `activeClients` Map 存储每个 accountId 的 client 实例
- 出站消息通过 `getActiveClient()` 获取 client

### src/inbound-handler.ts -- 消息处理
- `createInboundHandler()` 返回事件处理函数
- 处理逻辑：
  1. 跳过 self 消息和（配置外）bot 消息
  2. 解析插件命令（`/print-context`, `/ctx`, `/new`, `/reset`, `/clear`）
  3. 群组 mention gate 检查
  4. 路由到对应 agent
  5. 构建 envelope 和 history
  6. dispatch reply 并使用 streaming card 增量更新

### src/agent-tools.ts -- Agent 工具
- `createKookPlatformToolFactory()` 返回 tool factory
- 工具名：`kook_platform`
- 支持 actions：`list_guilds`, `view_guild`, `list_channels`, `create_message` 等
- 工具会获取当前 active client 执行 REST API 调用

### src/kook-guidance.ts -- 平台知识注入
- `KOOK_PLATFORM_GUIDANCE` 字符串
- 通过 `api.on('before_prompt_build')` 注入到 agent system prompt
- 包含 KMarkdown 语法、Card 格式、API actions 速查

## Adapter Pattern

OpenClaw 通道插件使用 adapter 模式：
```
kookPlugin.config      -- ChannelConfigAdapter   (配置读取)
kookPlugin.gateway     -- ChannelGatewayAdapter   (连接生命周期)
kookPlugin.security    -- ChannelSecurityAdapter  (DM 策略)
kookPlugin.groups      -- ChannelGroupAdapter     (群组 mention 规则)
kookPlugin.mentions    -- ChannelMentionAdapter   (mention 处理)
kookPlugin.messaging   -- ChannelMessagingAdapter (target 规范化)
kookPlugin.outbound    -- ChannelOutboundAdapter   (发送消息)
kookPlugin.directory   -- ChannelDirectoryAdapter (用户/群组列表)
kookPlugin.status      -- ChannelStatusAdapter    (连接状态探测)
```

## Key Types

### KookAccount (src/types.ts)
```typescript
interface KookAccount {
  botToken: string
  enabled: boolean
  baseUrl: string
  logLevel: string
  trustedGuilds: string[]
  acceptBotMessage: boolean
}
```

### KookChannelConfig
运行时配置，读取自 `cfg.channels.kook`。

## Gotchas

- **startAccount 必须阻塞**：必须 await abortSignal，否则 OpenClaw 会认为账号退出并触发自动重启
- **activeClients 是模块级 Map**：多个 account 时存储不同 client 实例
- **streaming card 需要 finalize()**：回复完成后必须调用，否则会残留 placeholder
- **群组 history 按 channelId 隔离**：historyKey = event.target_id
