const path = require("path");
const { requireLocationId, resolveOutputRoot } = require("./lib/config");

const DEFAULT_OUTPUT_ROOT = path.join(__dirname, "..", "client-materials", "audit-output");
const WORKSPACE_ROOT = path.join(__dirname, "..");

function outputPath(...parts) {
  return path.join(resolveOutputRoot(process.env, DEFAULT_OUTPUT_ROOT, WORKSPACE_ROOT), ...parts);
}

module.exports = {
  outputPath,
  requireLocationId,
  DEFAULT_OUTPUT_ROOT,
  WORKSPACE_ROOT,
};
