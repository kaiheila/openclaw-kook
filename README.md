# openclaw-kook

Kook 聊天平台的 OpenClaw 通道插件。

> **说明**：本文下方命令示例统一以 **OpenClaw** 为例（`openclaw ...`）。如果你安装的是 **Moltbot** / **Clawdbot** 版本，把命令中的 `openclaw` 替换成 `moltbot` / `clawdbot` 即可。

> **迁移提示**：旧包名为 `@kookapp/moltbot-kook`，已迁移到 `@kookapp/openclaw-kook`。如果你之前安装过旧包，请先卸载旧包，再安装新包。

## 安装

```bash
openclaw plugins install @kookapp/openclaw-kook
```

## 配置

### 1. 获取 KOOK Bot Token

访问 [KOOK 开发者平台](https://developer.kookapp.cn/bot/) 创建机器人，并在机器人配置页获取 Bot Token。

### 2. 通过 Web 界面配置（推荐）

打开配置页面：

```text
http://127.0.0.1:18789/chat
```

在设置中找到 KOOK 通道，建议至少配置以下参数：

| 配置项 | 必填 | 说明 |
|--------|------|------|
| `enabled` | 否 | 是否启用 KOOK 通道 |
| `botAuth` | **是** | KOOK Bot Token |
| `dmPolicy` | 否 | 私信访问策略：`pairing` / `allowlist` / `open` / `disabled` |
| `allowFrom` | 视策略而定 | 允许访问的用户 ID 列表，支持 `kook:用户ID` 或纯用户 ID |
| `acceptBotMessage` | 否 | 是否接收其他机器人的消息并加入上下文，默认 `true` |

> `botAuth` 是当前推荐字段名，用于避免 OpenClaw 配置界面对 `*token` 路径的自动脱敏。
> 旧字段 `botToken` 仍兼容，但新配置建议使用 `botAuth`。

### 3. 如何获取你的用户 ID

1. KOOK - 个人设置 - 高级设置 - 打开开发者模式。
2. 在服务器中右键自己的头像，复制 ID。
3. 或者给机器人发送一条消息，在日志中查看 `authorId`。

### 4. 使用命令行配置

```bash
openclaw config set channels.kook.enabled true
openclaw config set channels.kook.botAuth "你的Bot Token"
openclaw config set channels.kook.dmPolicy allowlist
openclaw config set channels.kook.allowFrom '["kook:你的用户ID"]'
```

### 5. 重启服务

```bash
openclaw gateway restart
```

## 配置示例

### 最小可用配置

```yaml
channels:
  kook:
    enabled: true
    botAuth: "你的Bot Token"
```

### 推荐配置

```yaml
channels:
  kook:
    enabled: true
    botAuth: "你的Bot Token"
    dmPolicy: allowlist
    allowFrom:
      - "kook:1234567890"
    acceptBotMessage: true
```

### 实验特性配置

`trustedGuilds` 仅在环境变量 `ENABLE_EXPERIMENTAL_FEATURES` 开启时生效；未开启时该配置会被视为 `[]`。

```bash
ENABLE_EXPERIMENTAL_FEATURES=true
```

```yaml
channels:
  kook:
    enabled: true
    botAuth: "你的Bot Token"
    trustedGuilds:
      - "guild_id_1"
      - "guild_id_2"
```

## 配置项说明

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | `boolean` | `true` | 是否启用 KOOK 通道 |
| `botAuth` | `string` | `""` | KOOK Bot Token，推荐使用的外部配置字段 |
| `baseUrl` | `string` | `https://www.kookapp.cn` | KOOK API 地址 |
| `dmPolicy` | `pairing \| allowlist \| open \| disabled` | `open` | 私信访问策略 |
| `allowFrom` | `string[]` | `[]` | 允许访问的用户 ID 列表 |
| `acceptBotMessage` | `boolean` | `true` | 是否接收其他机器人的消息并加入上下文 |
| `trustedGuilds` | `string[]` | `[]` | 实验特性；这些服务器中的成员会自动视为 allowlist 用户 |

## 行为说明

- 私信场景**无需 mention** 即可触发对话。
- 群组场景默认**需要 @机器人** 才会触发对话。
- 当 `dmPolicy=allowlist` 时，只有 `allowFrom` 中的用户可以通过私信访问。
- 当 `dmPolicy=pairing` 时，会结合 OpenClaw 的配对/授权存储进行访问控制。
- 当 `dmPolicy=disabled` 时，私信访问会被拒绝。

## 功能特性

- ✅ WebSocket 实时连接
- ✅ 私聊和频道消息支持
- ✅ 私信访问策略（`dmPolicy`）
- ✅ 群组 mention gate
- ✅ 消息分块与流式卡片回复
- ✅ 自动重连机制
- ✅ 实验性服务器信任名单（`trustedGuilds`）

## License

MIT
