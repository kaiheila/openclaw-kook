import { emptyPluginConfigSchema } from 'openclaw/plugin-sdk/core';
import { createKookPlatformToolFactory } from "./src/agent-tools.js";
import { kookPlugin } from "./src/channel.js";
import { KOOK_PLATFORM_GUIDANCE } from "./src/kook-guidance.js";
import { setKookRuntime } from "./src/runtime.js";
export { kookPlugin } from "./src/channel.js";
const plugin = {
    id: "openclaw-kook",
    name: "Kook",
    description: "Kook channel plugin for OpenClaw",
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