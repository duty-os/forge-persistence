function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepMergePreserve(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) {
      continue;
    }
    if (isPlainObject(value)) {
      if (!isPlainObject(target[key])) {
        target[key] = {};
      }
      deepMergePreserve(target[key], value);
      continue;
    }
    target[key] = value;
  }
}

function mergeConfig(existing, defaults) {
  const merged = JSON.parse(JSON.stringify(defaults));
  const normalized = JSON.parse(JSON.stringify(existing || {}));

  if (normalized.snapshotHost && !normalized.publicBaseUrl) {
    normalized.publicBaseUrl = normalized.snapshotHost;
  }
  if (normalized.adminToken && !normalized.admin?.token) {
    normalized.admin = { ...(normalized.admin ?? {}), token: normalized.adminToken };
  }
  if (normalized.admin && typeof normalized.admin.allowRemoteAccess !== "boolean") {
    normalized.admin.allowRemoteAccess = false;
  }
  if (normalized.rtm && typeof normalized.rtm.bootstrapMode !== "boolean") {
    normalized.rtm.bootstrapMode = (
      !normalized.rtm.appId ||
      !normalized.rtm.appCertificate ||
      normalized.rtm.appId === "project-appid" ||
      normalized.rtm.appCertificate === "project-appcertificate"
    );
  }

  deepMergePreserve(merged, normalized);
  merged.configVersion = defaults.configVersion;

  return merged;
}

module.exports = {
  mergeConfig,
};

if (require.main === module) {
  const fs = require("fs");

  const args = process.argv.slice(2);
  const getArg = (name) => {
    const idx = args.indexOf(name);
    return idx >= 0 ? args[idx + 1] : undefined;
  };

  const defaultsPath = getArg("--defaults");
  const currentPath = getArg("--current");
  const outputPath = getArg("--output");

  if (!defaultsPath || !currentPath || !outputPath) {
    throw new Error("usage: node config-merge.js --defaults <file> --current <file> --output <file>");
  }

  const defaults = JSON.parse(fs.readFileSync(defaultsPath, "utf8"));
  const current = JSON.parse(fs.readFileSync(currentPath, "utf8"));
  const merged = mergeConfig(current, defaults);
  fs.writeFileSync(outputPath, `${JSON.stringify(merged, null, 2)}\n`);
}
