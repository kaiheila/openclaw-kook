import { emptyPluginConfigSchema } from 'openclaw/plugin-sdk/core';
import { createKookPlatformToolFactory } from './agent-tools';
import { kookPlugin } from './channel';
import { KOOK_PLATFORM_GUIDANCE } from './kook-guidance';
import { setKookRuntime } from './runtime';
const plugin = {
    id: 'openclaw-channel-kook',
    name: 'KOOK Channel',
    description: 'KOOK (formerly KaiHeiLa) messaging platform channel for OpenClaw',
    configSchema: emptyPluginConfigSchema(),
    register(api) {
        setKookRuntime(api.runtime);
        api.registerChannel({ plugin: kookPlugin });
        api.registerTool(createKookPlatformToolFactory(), { name: 'kook_platform' });
        // Inject KOOK platform knowledge into the agent's system prompt
        api.on('before_prompt_build', () => ({
            appendSystemContext: KOOK_PLATFORM_GUIDANCE,
        }));
    },
};
export default plugin;
//# sourceMappingURL=index.js.map