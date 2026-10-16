// Captures the system prompt an agent really sends, so the guardrail rules
// can be held to it instead of to a guess.
//
//   node scripts/extract-guardrails.mjs            capture every target found
//   node scripts/extract-guardrails.mjs --only claude-code
//   node scripts/extract-guardrails.mjs --check    check the packs against
//                                                  what was captured before
//   node scripts/extract-guardrails.mjs --engine "C:/path/to/claude.exe"
//
// How it works: a stand-in for the vendor's API listens on loopback, the
// agent is pointed at it with its own --settings (which wins over the
// user's), and the body it posts is kept. Nothing leaves the machine, no
// account is used, and the reply the stand-in gives back is thrown away.
//
// The capture lands in reference/ — which is not in the repository, because
// it is somebody else's prompt text — and then page/samples.js is written
// from it by scripts/make-samples.mjs. Only the derived patterns and the
// short excerpts the page shows are committed.
import { createServer } from "node:http"
import { spawn, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { tmpdir } from "node:os"

const here = import.meta.dir ?? dirname(fileURLToPath(import.meta.url))
const root = join(here, "..")
const refDir = join(root, "reference")

const argv = process.argv.slice(2)
const only = flag("--only")
const check = argv.includes("--check")
const engineArg = flag("--engine")
const noSamples = argv.includes("--no-samples")

function flag(name) {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null
}

// ---------------------------------------------------------------------------
// what to capture, and where its engine is
// ---------------------------------------------------------------------------

const home = process.env.USERPROFILE || process.env.HOME || ""
const localApp = process.env.LOCALAPPDATA || ""

// Claude Desktop keeps the Claude Code it runs in a versioned folder of its
// own data directory; the newest one is the one it uses now
function desktopEngine() {
  const bases = [
    join(localApp, "Claude-3p", "claude-code"),
    join(localApp, "Claude", "claude-code"),
    join(home, "Library", "Application Support", "Claude", "claude-code"),
    join(home, ".config", "Claude", "claude-code"),
  ]
  const found = []
  for (const base of bases) {
    if (!existsSync(base)) continue
    for (const version of readdirSync(base)) {
      const dir = join(base, version)
      if (!statSync(dir).isDirectory()) continue
      for (const inner of readdirSync(dir)) {
        for (const name of ["claude.exe", "claude"]) {
          const exe = join(dir, inner, name)
          if (existsSync(exe)) found.push({ exe, version })
        }
      }
    }
  }
  found.sort((a, b) => cmpVersion(b.version, a.version))
  return found[0] ? found[0].exe : null
}

function cmpVersion(a, b) {
  const pa = String(a).split(".").map(Number)
  const pb = String(b).split(".").map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d) return d
  }
  return 0
}

function cliEngine() {
  const names = ["claude.exe", "claude"]
  const dirs = [join(home, ".local", "bin"), join(home, ".claude", "local"), "/usr/local/bin", "/usr/bin"]
  for (const d of dirs) for (const n of names) if (existsSync(join(d, n))) return join(d, n)
  const which = spawnSync(process.platform === "win32" ? "where" : "which", ["claude"], { encoding: "utf8" })
  const first = String(which.stdout || "").split("\n").map((s) => s.trim()).filter(Boolean)[0]
  return first && existsSync(first) ? first : null
}

const TARGETS = [
  { id: "claude-code", name: "Claude Code", engine: engineArg || cliEngine(), entrypoint: "" },
  { id: "claude-desktop", name: "Claude Desktop", engine: engineArg || desktopEngine(), entrypoint: "claude-desktop-3p" },
].filter((t) => t.engine)

// ---------------------------------------------------------------------------
// the stand-in upstream
// ---------------------------------------------------------------------------

function listen(dir) {
  mkdirSync(dir, { recursive: true })
  let n = 0
  const server = createServer((req, res) => {
    let body = ""
    req.on("data", (c) => { body += c })
    req.on("end", () => {
      const url = (req.url || "/").split("?")[0]
      if (body) writeFileSync(join(dir, `${String(++n).padStart(2, "0")}.json`), body)
      if (url.endsWith("/count_tokens")) {
        res.writeHead(200, { "content-type": "application/json" }).end('{"input_tokens":1}')
        return
      }
      const msg = {
        id: "msg_local", type: "message", role: "assistant", model: "local",
        content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      }
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(msg))
    })
  })
  return new Promise((done) => server.listen(0, "127.0.0.1", () => done({ server, port: server.address().port })))
}

// ---------------------------------------------------------------------------
// one capture
// ---------------------------------------------------------------------------

function settingsFile(port, entrypoint) {
  const env = {
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
    ANTHROPIC_API_KEY: "sk-local-capture",
    ANTHROPIC_AUTH_TOKEN: "sk-local-capture",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    CLAUDE_CODE_ENABLE_TELEMETRY: "0",
  }
  if (entrypoint) env.CLAUDE_CODE_ENTRYPOINT = entrypoint
  const file = join(tmpdir(), `magpie-prompt-guard-${port}.json`)
  writeFileSync(file, JSON.stringify({ env }))
  return file
}

async function capture(target) {
  const dir = join(refDir, ".capture", target.id)
  rmSync(dir, { recursive: true, force: true })
  const { server, port } = await listen(dir)
  const settings = settingsFile(port, target.entrypoint)
  const args = ["--settings", settings, "-p", "say ok"]
  const child = spawn(target.engine, args, {
    cwd: tmpdir(),
    stdio: ["ignore", "pipe", "pipe"],
    // a plain environment: the run must not pick up a token or a base URL
    // from the shell it was started in
    env: { PATH: process.env.PATH, HOME: home, USERPROFILE: home, LOCALAPPDATA: localApp, TEMP: tmpdir(), TMP: tmpdir(), SystemRoot: process.env.SystemRoot },
  })
  let said = ""
  child.stdout.on("data", (c) => { said += c })
  child.stderr.on("data", (c) => { said += c })
  const code = await new Promise((done) => {
    const stop = setTimeout(() => { child.kill(); done("timeout") }, 180000)
    child.on("close", (c) => { clearTimeout(stop); done(c) })
  })
  server.close()
  rmSync(settings, { force: true })

  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).sort() : []
  let system = null
  for (const f of files) {
    try {
      const body = JSON.parse(readFileSync(join(dir, f), "utf8"))
      if (body && body.system) system = body.system
    } catch (err) { /* not a request we can read */ }
  }
  if (!system) {
    console.error(`  ${target.id}: nothing captured (exit ${code})`)
    const first = files.length ? readFileSync(join(dir, files[0]), "utf8").slice(0, 200) : ""
    if (first) console.error("    first body: " + first.replace(/\s+/g, " ").slice(0, 160))
    return null
  }
  const blocks = Array.isArray(system) ? system.map((b) => b.text || "") : [String(system)]
  const header = blocks[0] || ""
  const version = (header.match(/cc_version=([\w.]+)/) || [])[1] || ""
  const entrypoint = (header.match(/cc_entrypoint=([\w-]+)/) || [])[1] || ""
  writeFileSync(join(refDir, `${target.id}.system.txt`), blocks.join("\n\n===== BLOCK =====\n\n"))
  writeFileSync(join(refDir, `${target.id}.json`), JSON.stringify({
    name: target.name, version, entrypoint, captured: new Date().toISOString().slice(0, 10), engine: target.engine,
  }, null, 2) + "\n")
  const chars = blocks.join("").length
  console.log(`  ${target.id}: ${chars} chars of system prompt${version ? " · " + version : ""}${entrypoint ? " · " + entrypoint : ""}`)
  return target.id
}

// ---------------------------------------------------------------------------
// checking the packs against a capture
// ---------------------------------------------------------------------------

// ruleMatches is whether a rule's own pattern is still somewhere in the
// capture — the invariant that matters when the vendor rewrites a prompt.
// Which rule actually removes a clause is another question: a clause the
// generic packs already cover is removed by them, and the pack's own rule
// for it never runs.
function ruleMatches(rule, text) {
  const flags = [...new Set("im" + (rule.flags || ""))].filter((c) => "ims".includes(c)).join("")
  try {
    return new RegExp(rule.pattern, flags).test(text)
  } catch (err) {
    return false
  }
}

async function checkPacks() {
  const mod = await import(pathToFileURL(join(root, "prompt-guard.middleware.js")).href)
  const samples = existsSync(join(root, "page", "samples.js"))
    ? (() => { const box = {}; new Function("globalThis", readFileSync(join(root, "page", "samples.js"), "utf8"))(box); return box.PromptGuardPresets || [] })()
    : []
  let bad = 0
  for (const preset of samples) {
    const file = join(refDir, `${preset.id}.system.txt`)
    if (!existsSync(file)) continue
    const body = readFileSync(file, "utf8").split("===== BLOCK =====").slice(1).join("===== BLOCK =====")
    const options = { guardrails: { packs: {} } }
    options.guardrails.packs[preset.pack] = true
    const r = mod.previewText(body, options, "system")
    const fired = new Set(r.hits.map((h) => h.id))
    const percent = ((body.length - r.out.length) / body.length) * 100
    console.log(`${preset.id}: ${fired.size} rule(s) removed something, ${percent.toFixed(1)}% of the prompt gone, ${r.out.length} chars left`)
    for (const h of r.hits) console.log(`   ${h.id}  ${JSON.stringify(String(h.match).slice(0, 70))}`)

    const book = mod.rulesFor("guardrails", { packs: {} })
    const quiet = []
    for (const id of preset.rules) {
      if (fired.has(id)) continue
      const rule = book.find((x) => x.id === id)
      if (!rule) {
        bad++
        console.log(`   GONE: ${id} is not in the engine's book`)
        continue
      }
      if (ruleMatches(rule, body)) quiet.push(id)
      else {
        bad++
        console.log(`   STALE: ${id} no longer matches the capture — the prompt changed, so the rule needs reading again`)
      }
    }
    if (quiet.length) console.log(`   already covered by a pack that runs first: ${quiet.join(", ")}`)
  }
  if (!samples.length) console.log("nothing to check: no page/samples.js")
  return bad
}

// ---------------------------------------------------------------------------

if (check) {
  const bad = await checkPacks()
  process.exit(bad ? 1 : 0)
}

if (!TARGETS.length) {
  console.error("no agent engine found. Pass one: --engine <path to claude>")
  process.exit(2)
}

mkdirSync(refDir, { recursive: true })
console.log("capturing the system prompt each agent sends:")
for (const target of TARGETS) {
  if (only && target.id !== only) continue
  await capture(target)
}

if (!noSamples) {
  const r = spawnSync(process.execPath, [join(here, "make-samples.mjs")], { stdio: "inherit" })
  if (r.status) process.exit(r.status)
}
