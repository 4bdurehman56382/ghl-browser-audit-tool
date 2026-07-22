const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { parsePositiveInteger } = require("./config");

const DEFAULT_CDP_HOST = "127.0.0.1";
const DEFAULT_CDP_PORT = 9222;
const LOCAL_CDP_HOSTS = new Set([DEFAULT_CDP_HOST, "localhost"]);
const requestedCdpUrl = (process.env.AUDIT_CDP_URL || "").replace(/\/+$/, "");
const requestedCdpInfo = requestedCdpUrl ? new URL(requestedCdpUrl) : null;
const requestedPort = process.env.AUDIT_CDP_PORT;
const CDP_PORT = requestedCdpInfo
  ? parsePositiveInteger(requestedCdpInfo.port || 80, DEFAULT_CDP_PORT, "AUDIT_CDP_URL port")
  : parsePositiveInteger(requestedPort, DEFAULT_CDP_PORT, "AUDIT_CDP_PORT");
const CDP_URL = requestedCdpInfo ? requestedCdpInfo.origin : localCdpOrigin(CDP_PORT);
const ATTACH_EXISTING_CDP = process.env.AUDIT_ATTACH_EXISTING_CDP === "1";

function localCdpOrigin(port) {
  return new URL(["http://", DEFAULT_CDP_HOST, ":", String(port)].join("")).origin;
}

function isLocalCdpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && LOCAL_CDP_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function findInPath(names, envPath = process.env.PATH || "") {
  const extensions = process.platform === "win32"
    ? (process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";")
    : [""];

  for (const dir of envPath.split(path.delimiter)) {
    if (!dir) continue;
    for (const name of names) {
      for (const extension of extensions) {
        const candidate = path.join(dir, `${name}${extension}`);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }
  return null;
}

function findChrome() {
  if (process.env.CHROME_PATH) {
    const configured = path.resolve(process.env.CHROME_PATH);
    if (!fs.existsSync(configured)) {
      throw new Error(`CHROME_PATH does not exist: ${configured}`);
    }
    return configured;
  }

  const candidates = [];
  if (process.platform === "linux") {
    candidates.push(
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium-browser",
      "/usr/bin/chromium",
      "/snap/bin/chromium",
      "/opt/google/chrome/chrome",
      "/opt/google/chrome/google-chrome"
    );
  } else if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium"
    );
  } else if (process.platform === "win32") {
    candidates.push(
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      path.join(os.homedir(), "AppData", "Local", "Google", "Chrome", "Application", "chrome.exe")
    );
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return findInPath(["google-chrome", "chromium-browser", "chromium"]);
}

function isCdpAlive() {
  return new Promise((resolve) => {
    const req = http.get(`${CDP_URL}/json/version`, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        try {
          const info = JSON.parse(data);
          resolve(Boolean(info.webSocketDebuggerUrl || info.Browser || info["Protocol-Version"]));
        } catch {
          resolve(false);
        }
      });
    });
    req.on("error", () => resolve(false));
    req.setTimeout(3000, () => { req.destroy(); resolve(false); });
  });
}

function printWarning() {
  const lines = [
    "",
    "\x1b[1;33m" + "=".repeat(68) + "\x1b[0m",
    "\x1b[1;31m  WARNING: AUTOMATED BROWSER AUDIT TOOL\x1b[0m",
    "\x1b[1;33m" + "=".repeat(68) + "\x1b[0m",
    "",
    "\x1b[1;37m  This tool will:\x1b[0m",
    "  1. Launch Google Chrome with remote debugging enabled.",
    "  2. Navigate through GoHighLevel pages systematically.",
    "  3. Take screenshots of every page and workflow.",
    "  4. Move a visual cursor across the screen (read-only).",
    "  5. Wait up to \x1b[1;33m45 seconds\x1b[0m per page for full loading.",
    "  6. Generate a comprehensive PDF audit report.",
    "",
    "\x1b[1;37m  Important:\x1b[0m",
    "  - This tool is \x1b[1;32mSTRICTLY READ-ONLY\x1b[0m. No data will be modified.",
    "  - It will NOT submit forms, delete data, or change settings.",
    "  - Screenshots and reports will be saved to client-materials/audit-output/.",
    "  - You will see a cursor moving across the screen during the audit.",
    "",
    "\x1b[1;37m  Prerequisites:\x1b[0m",
    "  - You must have Google Chrome or Chromium installed.",
    "  - You must be logged into GoHighLevel in the launched browser.",
    "  - Set GHL_LOCATION_ID environment variable for location-specific audits.",
    "  - Port 9222 must be available.",
    "  - Set AUDIT_ATTACH_EXISTING_CDP=1 before attaching to an already-running CDP browser.",
    "",
    "\x1b[1;33m" + "=".repeat(68) + "\x1b[0m",
    "",
  ];
  console.log(lines.join("\n"));
}

async function waitForCdp(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isCdpAlive()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function launchChrome() {
  const chromePath = findChrome();
  if (!chromePath) {
    throw new Error(
      "Could not find Google Chrome or Chromium. Please install one or set CHROME_PATH."
    );
  }

  if (await isCdpAlive()) {
    if (!ATTACH_EXISTING_CDP) {
      throw new Error(
        `Chrome DevTools Protocol is already available at ${CDP_URL}. ` +
        "Set AUDIT_ATTACH_EXISTING_CDP=1 if you intentionally want to attach to it."
      );
    }
    console.log(`\x1b[1;32m✓ Chrome DevTools Protocol already running on port ${CDP_PORT}\x1b[0m`);
    return { launched: false, port: CDP_PORT, url: CDP_URL };
  }

  if (requestedCdpUrl && !isLocalCdpUrl(requestedCdpUrl)) {
    throw new Error("AUDIT_CDP_URL points to a remote endpoint. Start/connect to that browser yourself with AUDIT_ATTACH_EXISTING_CDP=1.");
  }

  const userDataDir = path.join(
    os.homedir(),
    ".audit-tool-chrome-profile"
  );

  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  const args = [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions-except=",
    "--disable-popup-blocking",
    "--disable-sync",
    "--disable-translate",
    "--disable-features=TranslateUI",
    "--disable-component-update",
    "--disable-background-networking",
    "--disable-session-crashed-bubble",
    "--disable-prompt-on-repost",
    "--disable-renderer-backgrounding",
    "--disable-dev-shm-usage",
    "--window-size=1440,900",
    "--window-position=0,0",
    "about:blank",
  ];

  if (process.env.AUDIT_CHROME_NO_SANDBOX === "1") {
    args.splice(args.length - 1, 0, "--no-sandbox");
  }

  console.log(`\x1b[1;36m  Launching Chrome with remote debugging on port ${CDP_PORT}...\x1b[0m`);

  const proc = spawn(chromePath, args, {
    detached: true,
    stdio: "ignore",
  });
  proc.unref();

  console.log("\x1b[1;36m  Waiting for Chrome DevTools Protocol...\x1b[0m");
  const alive = await waitForCdp(30000);

  if (!alive) {
    throw new Error(
      `Chrome did not start with remote debugging. Check that Chrome is installed and port ${CDP_PORT} is available.`
    );
  }

  console.log(`\x1b[1;32m✓ Chrome launched with remote debugging on port ${CDP_PORT}\x1b[0m`);
  return { launched: true, port: CDP_PORT, url: CDP_URL };
}

module.exports = { launchChrome, isCdpAlive, isLocalCdpUrl, printWarning, CDP_URL, CDP_PORT, findChrome };
