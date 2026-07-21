const path = require("path");

const outputRoot = path.resolve(
  process.env.AUDIT_OUTPUT_DIR || path.join(__dirname, "..", "client-materials", "audit-output")
);

function outputPath(...parts) {
  return path.join(outputRoot, ...parts);
}

function requireLocationId() {
  const locationId = process.env.GHL_LOCATION_ID;
  if (!locationId) {
    throw new Error("Set GHL_LOCATION_ID before running this location-specific audit script.");
  }
  return locationId;
}

module.exports = {
  outputPath,
  requireLocationId,
};
