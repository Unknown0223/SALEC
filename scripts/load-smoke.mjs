#!/usr/bin/env node
/**
 * Oddiy HTTP yuk sinovi (tashqi dependency yo‘q).
 * Misol: node scripts/load-smoke.mjs --base http://127.0.0.1:4000 --path /health --n 500 --c 25
 */
import http from "node:http";
import https from "node:https";
import { performance } from "node:perf_hooks";

function parseArgs() {
  const a = process.argv.slice(2);
  const get = (k, d) => {
    const i = a.indexOf(k);
    return i >= 0 && a[i + 1] ? a[i + 1] : d;
  };
  return {
    base: get("--base", "http://127.0.0.1:4000"),
    path: get("--path", "/health"),
    n: Number(get("--n", "200")),
    c: Number(get("--c", "10"))
  };
}

function request(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const t0 = performance.now();
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + u.search,
        method: "GET",
        timeout: 30_000
      },
      (res) => {
        res.resume();
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, ms: performance.now() - t0 });
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.end();
  });
}

async function main() {
  const { base, path: p, n, c } = parseArgs();
  if (!Number.isFinite(n) || n < 1 || !Number.isFinite(c) || c < 1) {
    console.error("Invalid --n or --c");
    process.exit(1);
  }
  const url = base.replace(/\/$/, "") + (p.startsWith("/") ? p : "/" + p);
  console.log(`GET ${url}  total=${n}  concurrency=${c}`);

  const latencies = [];
  let ok = 0;
  let fail = 0;
  const tStart = performance.now();

  let next = 0;
  async function worker() {
    while (next < n) {
      const i = next++;
      try {
        const r = await request(url);
        latencies.push(r.ms);
        if (r.status >= 200 && r.status < 300) ok++;
        else fail++;
      } catch {
        fail++;
      }
    }
  }

  await Promise.all(Array.from({ length: c }, () => worker()));

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
  const totalMs = performance.now() - tStart;

  console.log(
    JSON.stringify(
      {
        ok,
        fail,
        totalWallMs: Math.round(totalMs),
        rps: Math.round((n / totalMs) * 1000),
        latencyMs: { p50: Math.round(p50), p95: Math.round(p95), max: Math.round(latencies[latencies.length - 1] ?? 0) }
      },
      null,
      0
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
