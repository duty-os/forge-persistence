export function isBootstrapRtmConfig(config: { rtm?: { bootstrapMode?: boolean } }): boolean {
    return config.rtm?.bootstrapMode === true;
}

export function createBootstrapTokenError(message: string) {
    return {
        status: 503,
        message: `RTM bootstrap mode: ${message}`,
    };
}
