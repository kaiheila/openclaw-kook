import { createPluginRuntimeStore } from 'openclaw/plugin-sdk'
import type { PluginRuntime } from 'openclaw/plugin-sdk'

const { setRuntime: setKookRuntime, getRuntime: getKookRuntime, tryGetRuntime: tryGetKookRuntime } =
  createPluginRuntimeStore<PluginRuntime>('KOOK runtime not initialized')

export { getKookRuntime, setKookRuntime, tryGetKookRuntime }
