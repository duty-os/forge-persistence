export function isBootstrapRtmConfig(config: { rtm?: { bootstrapMode?: boolean; appId?: string; appCertificate?: string } }): boolean {
    return config.rtm?.bootstrapMode === true ||
        !config.rtm?.appId ||
        !config.rtm?.appCertificate;
}

export function createBootstrapTokenError(message: string) {
    return {
        status: 503,
        message: `RTM bootstrap mode: ${message}`,
    };
}
