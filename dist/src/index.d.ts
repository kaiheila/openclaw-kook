import type { OpenClawPluginApi } from 'openclaw/plugin-sdk/core';
declare const plugin: {
    id: string;
    name: string;
    description: string;
    configSchema: import("openclaw/plugin-sdk").OpenClawPluginConfigSchema;
    register(api: OpenClawPluginApi): void;
};
export default plugin;
//# sourceMappingURL=index.d.ts.map