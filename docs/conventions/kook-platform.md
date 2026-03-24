# KOOK Platform Conventions

> When to read: 需要发送 KOOK 消息、处理 KMarkdown、或调用 kook_platform 工具时

## Message Types

| type 值 | 说明 | 备注 |
|---------|------|------|
| 1 | 文本 | 纯文本 |
| 9 | KMarkdown | 富文本（推荐） |
| 10 | Card | JSON 卡片消息 |

发送消息时 content 字段传入对应格式。

## KMarkdown Syntax

```
**bold**   *italic*   ~~strike~~   `code`
[text](url)            -- 链接
(met)userId(met)       -- @用户
(met)all(met)          -- @所有人
(met)here(met)         -- @在线
(rol)roleId(rol)       -- @角色
(chn)channelId(chn)    -- #频道
(emj)name(emj)[emojiId] -- 表情
> quote                -- 引用
---                    -- 分隔线
(spl)spoiler(spl)      -- 剧透
(ins)underline(ins)    -- 下划线
```

## Card Message Format

content 必须是 JSON 字符串数组：
```json
[{ "type":"card", "theme":"secondary", "size":"lg", "modules":[...] }]
```

常用模块类型：
- `section` -- 文本段落
- `header` -- 标题
- `divider` -- 分隔线
- `image-group` -- 图片组
- `action-group` -- 按钮组

### CardBuilder (from @kookapp/js-sdk)

```typescript
import { CardBuilder } from '@kookapp/js-sdk'

const card = CardBuilder.fromTemplate({ initialCard: { theme: 'none' } })
card.addKMarkdownText('**Hello** world')
card.addImage('https://example.com/image.png')

client.api.createMessage({
  target_id: channelId,
  content: card.build(),
  type: 10,  // Card message
})
```

## StreamingCard

用于长消息增量更新，避免用户等待：

```typescript
import { StreamingCard } from '@kookapp/js-sdk'

const streamingCard = new StreamingCard({
  api: client.api,
  targetId: channelId,
  quoteMessageId: replyToId,
  maxLength: 4500,
  throttleMs: 300,
  initialCard: (card) => {
    card.addKMarkdownText('*Bot 正在输入...*')
    return card
  },
})

await streamingCard.initialize()
// 增量添加内容
await streamingCard.appendText('**新内容**')
await streamingCard.finalize()  // 必须调用
```

## Plugin Commands

插件拦截的命令（不传给 OpenClaw）：

| 命令 | 说明 |
|------|------|
| `/print-context` | 打印当前会话上下文 |
| `/ctx` | 同上 |
| `/new` | 新会话 |
| `/reset` | 重置会话 |
| `/clear` | 清除会话 |

## DM Policy

配置项 `dmPolicy`：
- `pairing` -- 需要配对
- `allowlist` -- 需要在 allowFrom 列表
- `open` -- 开放
- `disabled` -- 禁用

## Trusted Guilds

`trustedGuilds` 列表中的服务器成员自动视为 allowFrom。
