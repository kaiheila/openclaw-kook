import type { AnyAgentTool } from 'openclaw/plugin-sdk/core';
type ToolFactory = (ctx: {
    agentAccountId?: string;
}) => AnyAgentTool | null;
export declare function createKookPlatformToolFactory(): ToolFactory;
export {};
//# sourceMappingURL=agent-tools.d.ts.map