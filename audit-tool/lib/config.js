const fs = require("fs");
const path = require("path");

function parsePositiveInteger(value, fallback, name = "value") {
  if (value === undefined || value === null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return number;
}

function validateLocationId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{3,128}$/.test(value.trim());
}

function optionalLocationId(env = process.env) {
  const locationId = (env.GHL_LOCATION_ID || "").trim();
  if (!locationId) return "";
  if (!validateLocationId(locationId)) {
    throw new Error("GHL_LOCATION_ID may only contain letters, numbers, underscores, and hyphens.");
  }
  return locationId;
}

function requireLocationId(env = process.env) {
  const locationId = optionalLocationId(env);
  if (!locationId) {
    throw new Error("Set GHL_LOCATION_ID before running this location-specific audit script.");
  }
  return locationId;
}

function resolveOutputRoot(env = process.env, defaultRoot, baseDir = process.cwd()) {
  const override = env.AUDIT_OUTPUT_DIR;
  if (!override) return path.resolve(defaultRoot);
  return path.isAbsolute(override) ? path.resolve(override) : path.resolve(baseDir, override);
}

function readJsonFile(filePath, label = "JSON file") {
  if (!filePath) throw new Error(`${label} path is required.`);
  const resolved = path.resolve(filePath);
  try {
    return JSON.parse(fs.readFileSync(resolved, "utf8"));
  } catch (error) {
    throw new Error(`Could not read ${label} at ${resolved}: ${error.message}`);
  }
}

function loadFunnels(env = process.env) {
  const configPath = env.GHL_FUNNELS_JSON;
  if (!configPath) {
    throw new Error("Set GHL_FUNNELS_JSON to a JSON file containing [{ name, funnelId, stepId }].");
  }

  const funnels = readJsonFile(configPath, "GHL_FUNNELS_JSON");
  if (!Array.isArray(funnels)) {
    throw new Error("GHL_FUNNELS_JSON must contain an array of funnel objects.");
  }

  return funnels.map((funnel, index) => {
    const normalized = {
      name: String(funnel?.name || "").trim(),
      funnelId: String(funnel?.funnelId || "").trim(),
      stepId: String(funnel?.stepId || "").trim(),
    };
    if (!normalized.name || !normalized.funnelId || !normalized.stepId) {
      throw new Error(`GHL_FUNNELS_JSON item ${index + 1} must include name, funnelId, and stepId.`);
    }
    return normalized;
  });
}

function loadRetryRoutes(env = process.env) {
  const configPath = env.GHL_RETRY_ROUTES_JSON;
  if (!configPath) return [];

  const routes = readJsonFile(configPath, "GHL_RETRY_ROUTES_JSON");
  if (!Array.isArray(routes)) {
    throw new Error("GHL_RETRY_ROUTES_JSON must contain an array of route objects.");
  }

  return routes.map((route, index) => {
    const normalized = {
      name: String(route?.name || "").trim(),
      path: String(route?.path || "").trim(),
      expect: Array.isArray(route?.expect) ? route.expect.map((x) => String(x)).filter(Boolean) : [],
      minBody: parsePositiveInteger(route?.minBody, 500, `GHL_RETRY_ROUTES_JSON item ${index + 1} minBody`),
    };
    if (!normalized.name || !normalized.path.startsWith("/")) {
      throw new Error(`GHL_RETRY_ROUTES_JSON item ${index + 1} must include a name and an absolute path.`);
    }
    return normalized;
  });
}

module.exports = {
  loadFunnels,
  loadRetryRoutes,
  optionalLocationId,
  parsePositiveInteger,
  readJsonFile,
  requireLocationId,
  resolveOutputRoot,
  validateLocationId,
};
