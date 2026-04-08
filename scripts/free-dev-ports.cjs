/**
 * Frees dev ports before `npm run dev`.
 * On Windows avoids `kill-port` calling `TaskKill` with no PID (can hang / break `&&`).
 */
const { execSync, spawnSync } = require("child_process");
const path = require("path");

const argv = process.argv.slice(2).map((s) => Number.parseInt(s, 10));
const PORTS = argv.filter((n) => n > 0).length ? argv.filter((n) => n > 0) : [4000, 3000];

function pidsListeningOnPortWindows(port) {
  const out = execSync("netstat -ano", { encoding: "utf8" });
  const pids = new Set();
  const needle = `:${port}`;
  for (const line of out.split(/\r?\n/)) {
    if (!line.includes("LISTENING") || !line.includes(needle)) continue;
    const cols = line.trim().split(/\s+/);
    const pid = cols[cols.length - 1];
    if (/^\d+$/.test(pid)) pids.add(pid);
  }
  return [...pids];
}

function freeWindows(ports) {
  for (const port of ports) {
    const pids = pidsListeningOnPortWindows(port);
    for (const pid of pids) {
      spawnSync("taskkill", ["/F", "/PID", pid], { stdio: "ignore" });
    }
  }
}

function freeUnix(ports) {
  const root = path.join(__dirname, "..");
  for (const port of ports) {
    spawnSync("npx", ["--yes", "kill-port", String(port)], {
      stdio: "inherit",
      cwd: root,
      shell: true
    });
  }
}

if (process.platform === "win32") {
  freeWindows(PORTS);
} else {
  freeUnix(PORTS);
}
