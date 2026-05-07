export function isExperimentalFeaturesEnabled() {
    const env = globalThis.process?.env;
    const raw = env?.ENABLE_EXPERIMENTAL_FEATURES;
    if (!raw) {
        return false;
    }
    switch (raw.trim().toLowerCase()) {
        case '1':
        case 'true':
        case 'yes':
        case 'on':
            return true;
        default:
            return false;
    }
}
//# sourceMappingURL=beta.js.map