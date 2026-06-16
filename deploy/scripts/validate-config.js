function validateConfig(config, options = {}) {
  const strict = Boolean(options.strict);
  const mode = options.mode || config.deployMode;
  const adminPlaceholder = "change-me-to-a-random-32-byte-token";
  const rtmAppId = config.rtm?.appId;
  const rtmAppCertificate = config.rtm?.appCertificate;
  const bootstrapRtm = (
    !rtmAppId ||
    !rtmAppCertificate ||
    rtmAppId === "project-appid" ||
    rtmAppCertificate === "project-appcertificate"
  );
  const effectiveBootstrapMode = config.rtm?.bootstrapMode ?? bootstrapRtm;

  if (config.serviceType !== "localFile") {
    throw new Error("serviceType must be localFile");
  }
  if (!["app", "nginx"].includes(mode)) {
    throw new Error("invalid deploy mode");
  }
  if (!config.localFile?.snapshotDataPath || !config.localFile?.logFilePath || !config.localFile?.clientlogPath) {
    throw new Error("local file paths are required");
  }
  if (!config.localFile.logFilePath.endsWith("server.log")) {
    throw new Error("logFilePath must end with server.log");
  }
  if (!config.admin?.token || typeof config.admin.token !== "string" || config.admin.token.length < 32) {
    throw new Error("admin token must be at least 32 characters");
  }
  if (config.admin.token === adminPlaceholder) {
    throw new Error("admin token must not use the shipped placeholder value");
  }
  if (config.tls?.enabled) {
    if (!config.tls.certPath || !config.tls.keyPath) {
      throw new Error("tls certPath and keyPath are required when tls is enabled");
    }
    if (config.tls.certPath !== "./config/tls/tls.crt" || config.tls.keyPath !== "./config/tls/tls.key") {
      throw new Error("tls certificates must stay under ./config/tls as tls.crt/tls.key");
    }
  }
  if (!strict && !config.publicBaseUrl && config.bootstrapPublicUrl !== true) {
    throw new Error("public base url is required when bootstrap fallback is disabled");
  }
  if (config.rtm?.bootstrapMode === false && bootstrapRtm) {
    throw new Error("RTM bootstrap placeholders require bootstrap mode");
  }
  if (strict && effectiveBootstrapMode) {
    throw new Error("RTM credentials are still in bootstrap mode");
  }
  if (strict && !config.publicBaseUrl) {
    throw new Error("public base url is required in strict mode");
  }
}

module.exports = {
  validateConfig,
};

if (require.main === module) {
  const fs = require("fs");

  const args = process.argv.slice(2);
  const getArg = (name) => {
    const idx = args.indexOf(name);
    return idx >= 0 ? args[idx + 1] : undefined;
  };

  const configPath = getArg("--file") || "config/app.json";
  const mode = getArg("--mode");
  const strict = args.includes("--strict");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  validateConfig(config, { strict, mode });
}
