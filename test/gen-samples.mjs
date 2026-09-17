#!/usr/bin/env node
// SimpleLogSearch — test/gen-samples.mjs (CHECKLIST 5.1; spec: spec/webmcp.md §4)
//
// Deterministic, zero-dependency generator for the four sample logs in samples/.
// Seeded PRNG (mulberry32, fixed constants); no wall clock, no Math.random —
// re-running this script produces byte-identical output. The committed files
// are the source of truth (spec §4: "re-runnable; committed outputs are the
// source of truth").
//
// Self-checks every §4 content requirement + the < 50 KB size cap and prints
// the DESIGNED canonical-query match count for samples/windows-event.log:
//     "MID 123456" and "MID 123654" not "192.168.1.1"
// (spec/query-language.md §4; consumed by CHECKLIST 5.4/5.6, spec/webmcp §5).
// Verified against the real js/query-parser.js (same code path search_logs
// will use), not a re-implementation.
//
// Usage: node test/gen-samples.mjs
//        writes ../samples/*.log; exits non-zero on any check failure.

import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import QueryParser from "../js/query-parser.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "samples");
const MAX_BYTES = 50_000; // spec §4 "All < 50 KB" — strictest reading: 50,000 bytes

const CANONICAL_QUERY = '"MID 123456" and "MID 123654" not "192.168.1.1"';
// Design (windows-event.log): both-MID lines at 0-based idx 17, 55, 88, 214, 301;
// idx 55 + 301 also contain 192.168.1.1 → canonical NOT filters them out.
const DESIGN_CANONICAL_COUNT = 3; // = lines 18, 89, 215 (1-based) — record in Session Log

// --- deterministic PRNG --------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const irange = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1)); // inclusive
const pad2 = (n) => String(n).padStart(2, "0");

// Monotonic seeded clock. Date.UTC is a pure function of its args (not wall time);
// Date objects are used only as a deterministic format helper.
function makeClock(startMs, minStepS, maxStepS, rng) {
  let t = startMs;
  return () => {
    t += (minStepS + rng() * (maxStepS - minStepS)) * 1000;
    return new Date(t);
  };
}

// --- samples/windows-event.log (400 lines) --------------------------------------
const WIN_USERS = ["jdoe", "svc-backup", "admin", "mchen", "deploy", "gferguson"];
const WIN_SERVICES = ["Spooler", "W3SVC", "TermService", "SQLAgent", "MSDTC", "Netlogon"];
const WIN_APPS = ["apphost.exe", "reporting.exe", "sync-engine.exe"];
const WIN_MODS = ["kernelbase.dll", "clr.dll", "ntdll.dll"];
const WIN_TASKS = ["NightlyReport", "LogRotate", "CertRenewal", "DataSync"];
const WIN_HOSTS = ["web-01", "web-02", "db-01", "app-03"];
const WIN_FEATS = ["sso", "audit-trail", "token-rotation"];
const WIN_TENANTS = ["corp-01", "corp-02", "branch-north"];
const WIN_THREATS = ["Trojan:Win32/Wacatac.A!cl", "PUA:Win32/InstallCore.G", "Ransom:Win32/Peacok.B!ml"];
// Deliberately no 192.168.1.x addresses in filler pools (keeps the designed count obvious).
const WIN_IPS = ["10.0.2.44", "172.16.4.9", "203.0.113.7", "198.51.100.23"];

// [source, severity, eventID, message-template] — mixed severities + event IDs (spec §4).
const WIN_EVENTS = [
  ["Security", "Information", "4624", "A user was successfully authenticated: {user} from {ip}."],
  ["Security", "Warning", "4625", "Failed logon attempt for {user} from {ip} (reason: bad password)."],
  ["Security", "Information", "4634", "Audit policy was changed by {user}."],
  ["System", "Information", "7036", "The {svc} service entered the stopped state."],
  ["System", "Information", "7040", "The {svc} service was started in manual mode."],
  ["System", "Error", "1001", "Application '{app}' crashed; faulting module {mod}, offset 0x{off}."],
  ["System", "Information", "63", "Time synchronization completed with source time.windows.com."],
  ["Application", "Information", "8304", "Scheduled task '{task}' finished with exit code 0 on node {host}."],
  ["Application", "Warning", "8305", "Scheduled task '{task}' ran longer than its allotted window on node {host}."],
  ["Application", "Information", "1102", "Feature {feat} was enabled for tenant {tenant} by admin policy."],
  ["Service Control Manager", "Information", "7036", "The {svc} service stopped after receiving a stop request."],
  ["Windows Defender", "Information", "1116", "Antimalware real-time protection scans are enabled for {n} items."],
  ["Windows Defender", "Warning", "1015", "Potential threat {threat} was detected and blocked on {host}."],
];
// Marker lines (0-based index → [source, severity, eventID, message]).
// MID 123456 appears in 7 lines (17,42,55,88,214,301,355); MID 123654 in 7 (17,55,88,133,214,268,301);
// both MIDs + 192.168.1.1 in exactly 2 (55, 301); canonical match = 3 (17, 88, 214).
const WIN_MARKERS = {
  17: ["Application", "Information", "8304", "Job batch MID 123456 chained to follow-up job MID 123654 completed on node web-01."],
  42: ["Application", "Warning", "8305", "Job MID 123456 exceeded its 120 second time limit and was rescheduled."],
  55: ["System", "Error", "1001", "Replication of jobs MID 123456 and MID 123654 from source host 192.168.1.1 failed after 3 retries."],
  88: ["Application", "Information", "7036", "Scheduled tasks MID 123456 and MID 123654 finished inside the maintenance window on db-01."],
  133: ["Application", "Warning", "8306", "Job MID 123654 has been waiting on its upstream dependency for 45 minutes."],
  214: ["System", "Information", "8304", "Correlated operations MID 123456 and MID 123654 completed on host db-02 without errors."],
  268: ["System", "Information", "7040", "Service host for job MID 123654 started cleanly after the last update."],
  301: ["Application", "Error", "1074", "Maintenance stop requested for jobs MID 123456 / MID 123654 by administrator session from 192.168.1.1."],
  355: ["Application", "Information", "8304", "Job MID 123456 started on node web-01 and finished in 41 seconds."],
};

function genWindows(rng) {
  const N = 400;
  const clock = makeClock(Date.UTC(2026, 2, 14, 7, 0, 0), 3, 9, rng);
  const lines = new Array(N);
  for (let i = 0; i < N; i += 1) {
    const ts = clock().toISOString(); // e.g. 2026-03-14T07:00:03.412Z
    if (Object.prototype.hasOwnProperty.call(WIN_MARKERS, i)) {
      const [src, sev, id, msg] = WIN_MARKERS[i];
      lines[i] = `${ts}  ${src}  ${sev}  ${id}  ${msg}`;
      continue;
    }
    const [src, sev, id, tpl] = pick(rng, WIN_EVENTS);
    let severity = sev;
    if (id === "1001" && rng() < 0.15) severity = "Critical"; // rare Criticals keep severities mixed
    const msg = tpl
      .replace("{user}", pick(rng, WIN_USERS))
      .replace("{ip}", pick(rng, WIN_IPS))
      .replace("{svc}", pick(rng, WIN_SERVICES))
      .replace("{app}", pick(rng, WIN_APPS))
      .replace("{mod}", pick(rng, WIN_MODS))
      .replace("{off}", irange(rng, 0x1000, 0xffff).toString(16))
      .replace("{task}", pick(rng, WIN_TASKS))
      .replace("{host}", pick(rng, WIN_HOSTS))
      .replace("{feat}", pick(rng, WIN_FEATS))
      .replace("{tenant}", pick(rng, WIN_TENANTS))
      .replace("{threat}", pick(rng, WIN_THREATS))
      .replace("{n}", String(irange(rng, 4000, 9000)));
    lines[i] = `${ts}  ${src}  ${severity}  ${id}  ${msg}`;
  }
  return lines;
}

// --- samples/linux-syslog.log (400 lines) ---------------------------------------
const L_HOSTS = ["srv1", "srv2", "db-01", "web-01"];
const L_USERS = ["admin", "root", "deploy", "postgres", "www-data", "backup"];
const L_IPS = ["203.0.113.7", "203.0.113.9", "198.51.100.23", "10.0.2.44", "172.16.4.9"];
const L_FPS = ["x1:2a:9c", "b7:e0:44", "c3:5f:01", "9d:a2:6e"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function syslogStamp(d) {
  return `${MON[d.getUTCMonth()]} ${d.getUTCDate()} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}
function genSyslog(rng) {
  const N = 400;
  const clock = makeClock(Date.UTC(2026, 2, 14, 7, 0, 0), 1, 4, rng);
  let bootSec = 8123.4; // kernel boot-relative counter, advances with the clock
  const lines = new Array(N);
  for (let i = 0; i < N; i += 1) {
    const d = clock();
    bootSec += 1 + rng() * 5;
    const host = pick(rng, L_HOSTS);
    const r = rng();
    let procMsg;
    if (r < 0.42) {
      // auth events — syslog format with IPs and sshd auth failures (spec §4)
      const pid = irange(rng, 1024, 30000);
      const port = irange(rng, 1024, 65535);
      const ip = pick(rng, L_IPS);
      const user = pick(rng, L_USERS);
      procMsg = pick(rng, [
        `sshd[${pid}]: Failed password for invalid user ${user} from ${ip} port ${port} ssh2`,
        `sshd[${pid}]: Failed password for ${user} from ${ip} port ${port} ssh2`,
        `sshd[${pid}]: error: maximum authentication attempts exceeded for root from ${ip} port ${port} ssh2 [preauth]`,
        `sshd[${pid}]: Accepted publickey for deploy from ${ip} port ${port} ssh2: ED25519 SHA256:${pick(rng, L_FPS)}`,
        `sshd[${pid}]: Connection closed by authenticating user ${user} ${ip} port ${port} [preauth]`,
      ]);
    } else if (r < 0.62) {
      procMsg = pick(rng, [
        `kernel: [${bootSec.toFixed(4)}] eth0: NIC Link is Up 1000 Mbps Full Duplex`,
        `kernel: [${bootSec.toFixed(4)}] EXT4-fs (sda1): mounted filesystem with ordered data mode`,
        `kernel: [${bootSec.toFixed(4)}] NET: received packet for own address, dropped`,
        `cron[${irange(rng, 800, 900)}]: (${pick(rng, ["root", "deploy", "backup"])}) CMD (/usr/local/bin/nightly-report.sh)`,
      ]);
    } else if (r < 0.75) {
      procMsg = pick(rng, [
        `systemd[1]: Started Nightly log rotation timer.`,
        `systemd[${irange(rng, 800, 900)}]: Stopping Daily apt download activities...`,
        `systemd[1]: Reached target Timers.`,
      ]);
    } else if (r < 0.87) {
      const user = pick(rng, L_USERS);
      procMsg = `sudo[${irange(rng, 1024, 30000)}]: ${user} : TTY=pts/${irange(rng, 0, 3)} ; PWD=/home/${user} ; USER=root ; COMMAND=/usr/bin/apt update`;
    } else {
      procMsg = pick(rng, [
        `rsyslogd: imuxsock lost ${irange(rng, 2, 9)} messages from RID='syslog'`,
        `packagekitd[412]: package operation finished with ${pick(rng, ["success", "error", "idle"])}`,
        `CRON[1043]: pam_unix(cron:session): session opened for user root by (uid=0)`,
      ]);
    }
    lines[i] = `${syslogStamp(d)} ${host} ${procMsg}`;
  }
  return lines;
}
// --- samples/web-access.log (500 lines, Apache combined) -------------------------
const W_IPS = ["192.0.2.14", "192.0.2.88", "203.0.113.7", "203.0.113.52", "198.51.100.23", "198.51.100.101", "10.0.2.44", "172.16.4.9", "192.0.2.201", "203.0.113.9"];
const W_PATHS = ["/", "/index.html", "/login", "/search", "/api/v1/x", "/products/42", "/blog/p7", "/app.js", "/css/main.css"];
const W_UAS = ["curl/8.5.0", "Wget/1.21", "Mozilla/5.0", "Lynx/2.9", "python/3.12", "Googlebot/2.1"];

function webStamp(d) {
  return `${pad2(d.getUTCDate())}/${MON[d.getUTCMonth()]}/${d.getUTCFullYear()}:${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())} +0000`;
}

function genWebAccess(rng) {
  const N = 500;
  const clock = makeClock(Date.UTC(2026, 2, 14, 7, 0, 0), 1, 8, rng);
  const lines = new Array(N);
  for (let i = 0; i < N; i += 1) {
    const d = clock();
    const method = rng() < 0.9 ? "GET" : "POST";
    const path = method === "POST" ? pick(rng, ["/login", "/api/v1/x", "/search"]) : pick(rng, W_PATHS);
    const r = rng();
    const status = r < 0.7 ? "200" : r < 0.78 ? "301" : r < 0.93 ? "404" : "500"; // all four present (spec §4)
    const bytes = status === "404" ? irange(rng, 0, 200) : irange(rng, 120, 9999);
    const ref = rng() < 0.95 ? "-" : "https://example.com/";
    lines[i] = `${pick(rng, W_IPS)} - - [${webStamp(d)}] "${method} ${path} HTTP/1.1" ${status} ${bytes} "${ref}" "${pick(rng, W_UAS)}"`;
  }
  return lines;
}

// --- samples/app-json.log (300 lines, JSON per line) -----------------------------
const A_SERVICES = ["billing", "auth", "orders", "search", "payments", "inventory"];
const A_MSG_ERROR = [
  "upstream timeout after 30s",
  "payment provider returned 502",
  "order write failed: deadlock detected",
  "token verification failed: expired",
  "failed to connect to replica db-2 (ECONNREFUSED)",
];
const A_MSG_WARN = [
  "queue depth above soft limit (1200)",
  "cache hit ratio below 80 percent for 5m",
  "retrying request (attempt 2 of 3)",
  "slow query 1250ms on table orders",
  "disk usage at 78 percent on volume /data",
];
const A_MSG_INFO = [
  "request completed status=200",
  "user session created",
  "cache refreshed for key catalog",
  "nightly batch started",
  "health check ok latency=3ms",
];

function hex16(rng) {
  let s = "";
  for (let i = 0; i < 16; i += 1) s += "0123456789abcdef"[Math.floor(rng() * 16)];
  return s;
}

function genAppJson(rng) {
  const N = 300;
  const clock = makeClock(Date.UTC(2026, 2, 14, 7, 0, 0), 2, 6, rng);
  const lines = new Array(N);
  for (let i = 0; i < N; i += 1) {
    const r = rng();
    const level = r < 0.4 ? "error" : r < 0.75 ? "warn" : "info"; // error + warn present (spec §4)
    const msg = level === "error" ? pick(rng, A_MSG_ERROR) : level === "warn" ? pick(rng, A_MSG_WARN) : pick(rng, A_MSG_INFO);
    lines[i] = `{"ts":"${clock().toISOString()}","level":"${level}","service":"${pick(rng, A_SERVICES)}","trace_id":"${hex16(rng)}","message":"${msg}"}`;
  }
  return lines;
}
// --- write + self-check ----------------------------------------------------------
function toFileLines(lines) {
  return lines.join("\n") + "\n";
}

function readBackLines(path) {
  const text = readFileSync(path, "utf8");
  const a = text.split(/\r?\n/); // same split rule the app uses (upload flow)
  if (a.length && a[a.length - 1] === "") a.pop();
  return { lines: a, size: Buffer.byteLength(text) };
}

const failures = [];
function check(name, cond, detail) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!cond) failures.push(name);
}

const generated = [
  ["samples/windows-event.log", genWindows(mulberry32(0xc0ffee01))],
  ["samples/linux-syslog.log", genSyslog(mulberry32(0x5eed01))],
  ["samples/web-access.log", genWebAccess(mulberry32(0x5eed02))],
  ["samples/app-json.log", genAppJson(mulberry32(0x42424201))],
];

mkdirSync(OUT_DIR, { recursive: true });
const summary = [];
for (const [rel, lines] of generated) {
  const text = toFileLines(lines);
  writeFileSync(join(ROOT, rel), text, "utf8");
  summary.push([rel, Buffer.byteLength(text), createHash("sha256").update(text).digest("hex").slice(0, 12)]);
}

// Re-read from disk and check every §4 requirement against the written bytes.
const win = readBackLines(join(OUT_DIR, "windows-event.log"));
const sys = readBackLines(join(OUT_DIR, "linux-syslog.log"));
const web = readBackLines(join(OUT_DIR, "web-access.log"));
const app = readBackLines(join(OUT_DIR, "app-json.log"));

check("size < 50 KB (all four)", summary.every(([, s]) => s < MAX_BYTES),
  summary.map(([f, s]) => `${f.split("/")[1]}=${s}B`).join(", "));

// windows: line count + marker counts + canonical count via the REAL parser
check("windows 400 lines", win.lines.length === 400);
const midA = win.lines.filter((l) => l.includes("MID 123456")).length;
const midB = win.lines.filter((l) => l.includes("MID 123654")).length;
const bothIp = win.lines.filter((l) => l.includes("MID 123456") && l.includes("MID 123654") && l.includes("192.168.1.1")).length;
check("windows ≥3 MID 123456 / ≥3 MID 123654 / ≥2 both+192.168.1.1", midA >= 3 && midB >= 3 && bothIp >= 2,
  `MID123456=${midA}, MID123654=${midB}, both+IP=${bothIp}`);
const canonicalIdx = QueryParser.search(CANONICAL_QUERY, win.lines.map((l) => l.toLowerCase()));
check(`canonical query count == designed ${DESIGN_CANONICAL_COUNT}`, canonicalIdx.length === DESIGN_CANONICAL_COUNT,
  `matched 1-based lines ${canonicalIdx.map((i) => i + 1).join(", ")}`);
const winSevs = new Set(win.lines.map((l) => l.split("  ")[2]));
check("windows mixed severities", winSevs.size >= 3, [...winSevs].sort().join("/"));
// linux: count, syslog shape, auth failures, IPs
check("linux 400 lines", sys.lines.length === 400);
const lRe = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) +\d{1,2} \d{2}:\d{2}:\d{2} [a-z0-9.-]+ \S+: .+$/;
check("linux syslog format on every line", sys.lines.every((l) => lRe.test(l)));
const lAuth = sys.lines.filter((l) => l.includes("Failed password") || l.includes("maximum authentication attempts")).length;
check("linux auth failures present", lAuth >= 10, `${lAuth} lines`);
check("linux IPs present", sys.lines.some((l) => /\b\d{1,3}(\.\d{1,3}){3}\b/.test(l)));

// web: count, combined format, all four statuses
check("web 500 lines", web.lines.length === 500);
const wRe = /^\S+ - \S+ \[\d{2}\/[A-Z][a-z]{2}\/\d{4}:\d{2}:\d{2}:\d{2} \+0000\] "(GET|POST) \S+ HTTP\/1\.1" \d{3} \d+ "\S+" "\S+"$/;
check("web Apache combined format on every line", web.lines.every((l) => wRe.test(l)));
const wStatuses = new Set(web.lines.map((l) => l.match(/" (\d{3}) \d+/)[1]));
check("web statuses 200/301/404/500 all present", ["200", "301", "404", "500"].every((s) => wStatuses.has(s)), [...wStatuses].sort().join("/"));

// app-json: count, every line parses, levels + trace_id
check("app 300 lines", app.lines.length === 300);
let jsonOk = true;
const levels = new Set();
for (const l of app.lines) {
  try {
    const o = JSON.parse(l);
    if (!o.level || !o.trace_id || !/^[0-9a-f]{16}$/.test(o.trace_id)) jsonOk = false;
    levels.add(o.level);
  } catch { jsonOk = false; break; }
}
check("app every line valid JSON w/ trace_id", jsonOk);
check("app error + warn levels present", levels.has("error") && levels.has("warn"), [...levels].sort().join("/"));

console.log("");
for (const [f, s, h] of summary) console.log(`wrote ${f}  (${s} bytes, sha256:${h}…)`);
console.log(`DESIGNED canonical-query match count (windows-event.log): ${canonicalIdx.length}`);
console.log(`query: ${CANONICAL_QUERY}`);

if (failures.length) {
  console.error(`\n${failures.length} CHECK(S) FAILED — outputs NOT valid; regenerate before committing.`);
  process.exit(1);
}
console.log("ALL CHECKS PASS");
