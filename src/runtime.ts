import type { PluginRuntime } from 'openclaw/plugin-sdk/core'

const RUNTIME_KEY = Symbol.for('openclaw-kook:runtime')

function setKookRuntime(rt: PluginRuntime) {
  ;(globalThis as any)[RUNTIME_KEY] = rt
}

function getKookRuntime(): PluginRuntime {
  const rt = (globalThis as any)[RUNTIME_KEY] as PluginRuntime | undefined
  if (!rt) {
    throw new Error('KOOK runtime not initialized')
  }
  return rt
}

function tryGetKookRuntime(): PluginRuntime | null {
  return ((globalThis as any)[RUNTIME_KEY] as PluginRuntime | undefined) ?? null
}

export { getKookRuntime, setKookRuntime, tryGetKookRuntime }
