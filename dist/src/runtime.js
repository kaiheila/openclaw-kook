const RUNTIME_KEY = Symbol.for('openclaw-kook:runtime');
function setKookRuntime(rt) {
    ;
    globalThis[RUNTIME_KEY] = rt;
}
function getKookRuntime() {
    const rt = globalThis[RUNTIME_KEY];
    if (!rt) {
        throw new Error('KOOK runtime not initialized');
    }
    return rt;
}
function tryGetKookRuntime() {
    return globalThis[RUNTIME_KEY] ?? null;
}
export { getKookRuntime, setKookRuntime, tryGetKookRuntime };
//# sourceMappingURL=runtime.js.map