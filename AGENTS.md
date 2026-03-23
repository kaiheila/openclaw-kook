# moltbot-kook

> KOOK channel plugin for OpenClaw - enables AI agent to communicate via KOOK messaging platform

## Commands

- `pnpm install` -- 安装依赖
- `pnpm exec tsc` -- 编译 TypeScript
- `pnpm test` -- 运行测试 (vitest)
- `pnpm run format` -- 格式化代码 (Prettier)

## Architecture

- `src/channel.ts` -- 通道定义：config schema、capabilities、各类 adapter
- `src/connection-manager.ts` -- WebSocket 连接生命周期，使用 `@kookapp/js-sdk`
- `src/inbound-handler.ts` -- 消息处理：构建 context、历史管理、插件命令拦截
- `src/agent-tools.ts` -- AI 工具：暴露 KOOK REST API 给 agent 调用
- `src/send-service.ts` -- 出站消息服务，支持 streaming cards
- 架构详见 `docs/architecture/channel-architecture.md`

## Code Style

- TypeScript，ES2022，2 空格缩进
- 优先命名导出，`createXxx()` 工厂函数返回对象
- 禁止 `any`，敏感配置（如 token）标记 `sensitive: true`
- 格式化：Prettier，配置在 `.prettierrc` (如存在)

## Git

- 提交格式：`type(scope): description`
- type：`feat`, `fix`, `refactor`, `docs`, `test`, `chore`
- 分支：`feat/`, `fix/`, `chore/` 前缀

## Boundaries

- `dist/`、`node_modules/`、`.env*` -- 不要修改
- `pnpm-lock.yaml` -- 不要手动编辑
- 只在 `src/` 编写代码，其他目录按需创建

## 文档索引

- `docs/architecture/channel-architecture.md` -- 通道插件架构、模块关系
- `docs/conventions/kook-platform.md` -- KOOK 平台约定（KMarkdown、消息类型、Card 格式）
