# Migration Report: openclaw/plugin-sdk subpath imports

## Background

OpenClaw `2026.3.23` introduced a breaking change: the monolithic `openclaw/plugin-sdk` entry point no longer re-exports all symbols. Consumers must now import from specific subpaths (e.g. `openclaw/plugin-sdk/core`).

## Changes

### package.json

Added `peerDependencies` to enforce minimum openclaw version:

```json
"peerDependencies": {
  "openclaw": ">=2026.3.23"
}
```

### Import path migration (12 files)

| File | Old import | New subpath(s) |
|------|-----------|----------------|
| `index.ts` | `openclaw/plugin-sdk` | `openclaw/plugin-sdk/core` |
| `src/index.ts` | `openclaw/plugin-sdk` | `openclaw/plugin-sdk/core` |
| `src/agent-tools.ts` | `openclaw/plugin-sdk` | `openclaw/plugin-sdk/core` |
| `src/access-control.ts` | `openclaw/plugin-sdk` | `openclaw/plugin-sdk/channel-runtime` |
| `src/channel.ts` | `openclaw/plugin-sdk` | `openclaw/plugin-sdk/channel-runtime` |
| `src/config.ts` | `openclaw/plugin-sdk` | `openclaw/plugin-sdk/channel-runtime`, `openclaw/plugin-sdk/account-id` |
| `src/connection-manager.ts` | `openclaw/plugin-sdk` | `openclaw/plugin-sdk/channel-runtime`, `openclaw/plugin-sdk/reply-history` |
| `src/directory.ts` | `openclaw/plugin-sdk` | `openclaw/plugin-sdk/channel-runtime`, `openclaw/plugin-sdk/runtime-env` |
| `src/inbound-handler.ts` | `openclaw/plugin-sdk` | `openclaw/plugin-sdk/channel-runtime`, `openclaw/plugin-sdk/reply-runtime`, `openclaw/plugin-sdk/reply-history` |
| `src/runtime.ts` | `openclaw/plugin-sdk` | `openclaw/plugin-sdk/runtime-store`, `openclaw/plugin-sdk/core` |
| `src/status.ts` | `openclaw/plugin-sdk` | `openclaw/plugin-sdk/channel-runtime`, `openclaw/plugin-sdk/status-helpers` |

### Subpath mapping reference

| Subpath | Symbols used |
|---------|-------------|
| `core` | `OpenClawPluginApi`, `emptyPluginConfigSchema`, `AnyAgentTool`, `PluginRuntime` |
| `channel-runtime` | `ChannelPlugin`, `ChannelMeta`, `ChannelCapabilities`, `ChannelConfigSchema`, `ChannelGroupAdapter`, `ChannelMentionAdapter`, `ChannelMessagingAdapter`, `ChannelOutboundAdapter`, `ChannelOutboundContext`, `ChannelConfigAdapter`, `ChannelAccountSnapshot`, `ChannelGatewayAdapter`, `ChannelGatewayContext`, `ChannelStatusAdapter`, `ChannelDirectoryAdapter`, `ChannelDirectoryEntry`, `ChannelLogSink`, `ChannelSecurityAdapter`, `ChannelSecurityContext`, `ChannelSecurityDmPolicy`, `OpenClawConfig` |
| `account-id` | `DEFAULT_ACCOUNT_ID`, `normalizeAccountId` |
| `reply-history` | `DEFAULT_GROUP_HISTORY_LIMIT`, `buildPendingHistoryContextFromMap`, `clearHistoryEntriesIfEnabled`, `recordPendingHistoryEntryIfEnabled` |
| `reply-runtime` | `ReplyPayload` |
| `runtime-store` | `createPluginRuntimeStore` |
| `runtime-env` | `RuntimeEnv` |
| `status-helpers` | `createDefaultChannelRuntimeState`, `buildBaseAccountStatusSnapshot` |

## Verification

- `grep -r "from 'openclaw/plugin-sdk'" src/` returns zero matches (no bare `openclaw/plugin-sdk` imports remain)
- All 8 subpaths used are present in `openclaw@2026.3.23` package exports
- TypeScript resolves subpath types via `moduleResolution: "bundler"` + package `exports` field
