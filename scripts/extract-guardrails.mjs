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
// The engine ships two forms of its prompt and picks between them per
// model: the full one for a model on Anthropic's roster, the simple one for
// everything else — CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT=0 / 1 is the switch.
// Which form a machine gets therefore depends on the model it is pointed
// at, and a capture that took whatever came out would change shape with a
// model switch. So every form is asked for by name, and a run with no flag
// at all records which one this engine sends on its own.
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
// own data directory; the newest one is the one it uses now. Inside, the
// engine is either the binary itself (Windows, older macOS builds) or a
// macOS app bundle with the binary under Contents/MacOS.
function desktopEngine() {
  const bases = [
    join(localApp, "Claude-3p", "claude-code"),
    join(localApp, "Claude", "claude-code"),
    join(home, "Library", "Application Support", "Claude-3p", "claude-code"),
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
          if (existsSync(exe) && statSync(exe).isFile()) found.push({ exe, version })
        }
        const bundled = join(dir, inner, "claude.app", "Contents", "MacOS", "claude")
        if (existsSync(bundled)) found.push({ exe: bundled, version })
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

// The forms one engine's prompt comes in. The first run asks for nothing,
// so it is the form this machine's model gets; the other two name the switch
// so a model change cannot silently capture a different shape.
const FORMS = [
  { id: "default", env: {}, what: "the form this engine sends on its own" },
  { id: "full", env: { CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT: "0" }, what: "the full form" },
  { id: "simple", env: { CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT: "1" }, what: "the simple form" },
]

const TARGETS = [
  { id: "claude-code", name: "Claude Code", engine: engineArg || cliEngine(), entrypoint: "" },
  { id: "claude-desktop", name: "Claude Desktop", engine: engineArg || desktopEngine(), entrypoint: "claude-desktop-3p" },
]

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

function settingsFile(port, entrypoint, extra) {
  const env = {
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
    ANTHROPIC_API_KEY: "sk-local-capture",
    ANTHROPIC_AUTH_TOKEN: "sk-local-capture",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    CLAUDE_CODE_ENABLE_TELEMETRY: "0",
    ...extra,
  }
  if (entrypoint) env.CLAUDE_CODE_ENTRYPOINT = entrypoint
  const file = join(tmpdir(), `magpie-prompt-guard-${port}.json`)
  writeFileSync(file, JSON.stringify({ env }))
  return file
}

// captureFileName is where a form lands: the one the engine sends on its own
// keeps the plain name — what make-samples and the page have always read —
// and a named form goes beside it
function captureFileName(target, form) {
  return form.id === "default" ? `${target.id}.system.txt` : `${target.id}.system.${form.id}.txt`
}

async function capture(target, form) {
  const dir = join(refDir, ".capture", `${target.id}.${form.id}`)
  rmSync(dir, { recursive: true, force: true })
  const { server, port } = await listen(dir)
  const settings = settingsFile(port, target.entrypoint, form.env)
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
    console.error(`  ${target.id} · ${form.id}: nothing captured (exit ${code})`)
    const first = files.length ? readFileSync(join(dir, files[0]), "utf8").slice(0, 200) : ""
    if (first) console.error("    first body: " + first.replace(/\s+/g, " ").slice(0, 160))
    return null
  }
  const blocks = Array.isArray(system) ? system.map((b) => b.text || "") : [String(system)]
  const header = blocks[0] || ""
  const version = (header.match(/cc_version=([\w.]+)/) || [])[1] || ""
  const entrypoint = (header.match(/cc_entrypoint=([\w-]+)/) || [])[1] || ""
  const text = blocks.join("\n\n===== BLOCK =====\n\n")
  const file = captureFileName(target, form)
  writeFileSync(join(refDir, file), text)
  console.log(`  ${target.id} · ${form.id}: ${blocks.join("").length} chars of system prompt${version ? " · " + version : ""}${entrypoint ? " · " + entrypoint : ""}`)
  return { form: form.id, file, text, chars: blocks.join("").length, version, entrypoint }
}

// ---------------------------------------------------------------------------
// checking the packs against a capture
// ---------------------------------------------------------------------------

// captureForms is every distinct form of a target's prompt that is on disk:
// the one it sends on its own and the two named forms, with identical copies
// folded together — an engine that ignores the switch has one form, not two.
function captureForms(id) {
  const files = [`${id}.system.txt`, `${id}.system.full.txt`, `${id}.system.simple.txt`].map((f) => join(refDir, f))
  const forms = []
  const seen = new Set()
  for (const file of files) {
    if (!existsSync(file)) continue
    const body = readFileSync(file, "utf8").split("===== BLOCK =====").slice(1).join("===== BLOCK =====")
    if (!body.trim() || seen.has(body)) continue
    seen.add(body)
    const form = file.endsWith(".full.txt") ? "the full form" : file.endsWith(".simple.txt") ? "the simple form" : "the form this engine sends"
    forms.push({ file, form, body })
  }
  return forms
}

function captureMeta(id) {
  const file = join(refDir, `${id}.json`)
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {}
}

// ruleMatches is whether a rule's own pattern is still somewhere in a form
// of the capture — the invariant that matters when the vendor rewrites a
// prompt. Which rule actually removes a clause is another question: a clause
// the generic packs already cover is removed by them, and the pack's own
// rule for it never runs.
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
    const forms = captureForms(preset.id)
    if (!forms.length) {
      console.log(`${preset.id}: nothing captured on this machine — not checked`)
      continue
    }
    const meta = captureMeta(preset.id)
    const version = meta.version ? " · " + meta.version : ""
    const options = { guardrails: { packs: {}, keep: [...(mod.DEFAULT_KEEP || []), ...(preset.keep || [])] } }
    for (const id of preset.packs) options.guardrails.packs[id] = true

    const fired = new Set()
    const probes = [...(preset.gone || []), ...(preset.kept || [])]
    const seenProbe = new Set()
    for (const form of forms) {
      const r = mod.previewText(form.body, options, "system")
      for (const h of r.hits) fired.add(h.id)
      const percent = ((form.body.length - r.out.length) / form.body.length) * 100
      console.log(`${preset.id} · ${form.form}${version}: ${r.hits.length} rule(s) removed something, ${percent.toFixed(1)}% of the prompt gone, ${r.out.length} chars left of ${form.body.length}`)
      for (const h of r.hits) console.log(`   ${h.id}  ${JSON.stringify(String(h.match).slice(0, 70))}`)

      // the two invariants this whole thing exists for: what limits the work
      // is gone, and what makes the agent careful is still there — each held
      // to the form it is actually in
      for (const s of preset.gone || []) {
        if (!form.body.includes(s)) continue
        seenProbe.add(s)
        if (r.out.includes(s)) {
          bad++
          console.log(`   LIMIT LEFT in ${form.form}: ${JSON.stringify(s)} is still in what would be sent`)
        }
      }
      for (const s of preset.kept || []) {
        if (!form.body.includes(s)) continue
        seenProbe.add(s)
        if (!r.out.includes(s)) {
          bad++
          console.log(`   CAUTION LOST in ${form.form}: ${JSON.stringify(s)} was removed — the owner wants it kept`)
        }
      }
    }
    for (const s of probes) {
      if (seenProbe.has(s)) continue
      bad++
      console.log(`   STALE PROBE: ${JSON.stringify(s)} is in no form of the prompt any more`)
    }

    const book = mod.rulesFor("guardrails", { packs: {} })
    for (const id of preset.rules) {
      const rule = book.find((x) => x.id === id)
      if (!rule) {
        bad++
        console.log(`   GONE: ${id} is not in the engine's book`)
        continue
      }
      const where = forms.filter((f) => ruleMatches(rule, f.body)).map((f) => f.form)
      if (!where.length) {
        bad++
        console.log(`   STALE: ${id} matches no form of the capture — the prompt changed, so the rule needs reading again`)
      } else if (!fired.has(id)) {
        console.log(`   already covered by a pack that runs first: ${id} (${where.join(", ")})`)
      }
    }
    console.log("")
  }
  if (!samples.length) console.log("nothing to check: no page/samples.js")
  return bad
}

// ---------------------------------------------------------------------------

if (check) {
  const bad = await checkPacks()
  process.exit(bad ? 1 : 0)
}

const live = TARGETS.filter((t) => t.engine)
for (const t of TARGETS) if (!t.engine) console.log(`  ${t.id}: no engine on this machine — skipped (pass --engine <path> to capture one)`)
if (!live.length) {
  console.error("no agent engine found. Pass one: --engine <path to claude>")
  process.exit(2)
}

mkdirSync(refDir, { recursive: true })
console.log("capturing the system prompt each agent sends:")
for (const target of live) {
  if (only && target.id !== only) continue
  const got = []
  for (const form of FORMS) {
    const r = await capture(target, form)
    if (r) got.push(r)
  }
  if (!got.length) continue

  const said = got.find((r) => r.form === "default")
  const named = got.filter((r) => r.form !== "default")
  const same = (a, b) => Boolean(a && b && a.text === b.text)
  const first = got[0]
  const variants = {}
  for (const r of named) {
    const twin = named.find((x) => x !== r && same(x, r))
    variants[r.form] = {
      file: r.file,
      chars: r.chars,
      env: Object.entries(FORMS.find((f) => f.id === r.form).env).map(([k, v]) => `${k}=${v}`).join(" "),
      ...(twin ? { sameAs: twin.form } : {}),
    }
  }
  const onOwn = !said ? "" : same(said, named.find((r) => r.form === "full")) ? "full"
    : same(said, named.find((r) => r.form === "simple")) ? "simple" : ""
  writeFileSync(join(refDir, `${target.id}.json`), JSON.stringify({
    name: target.name, version: first.version, entrypoint: first.entrypoint,
    captured: new Date().toISOString().slice(0, 10), engine: target.engine,
    onOwn, variants,
  }, null, 2) + "\n")
  const counts = named.map((r) => `${r.form} ${r.chars}`).join(", ")
  console.log(`  ${target.id}: ${onOwn ? "this engine sends the " + onOwn + " form on its own" : "the form it sends on its own was not one asked for by name"}${counts ? " · " + counts : ""}`)
}

if (!noSamples) {
  const r = spawnSync(process.execPath, [join(here, "make-samples.mjs")], { stdio: "inherit" })
  if (r.status) process.exit(r.status)
}