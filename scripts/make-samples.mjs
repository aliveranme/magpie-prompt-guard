// Writes page/samples.js from the captures the extractor left in
// reference/ — the guardrail-bearing paragraphs of each target's own system
// prompt, and the rules that take them out.
//
//   node scripts/extract-guardrails.mjs        capture, then write this
//   node scripts/make-samples.mjs              write it from what is there
//
// The engine sends two forms of its prompt — the full one for a model on
// Anthropic's roster, the simple one for everything else — and both are
// excerpts of the same excerpt-making rules: each preset carries the forms
// its capture held under `variants`, and the tests hold the rules and the
// text together on every one of them. The excerpt the page shows
// (`sample`) is the first form, which is the full one when it is there.
//
// A target this machine has no capture of — the desktop app ships its
// engine as a download, and may not have one — keeps the entry it already
// had in page/samples.js rather than losing it: that entry then carries the
// one excerpt it was written with, and says so by having no `variants`.
//
// The file is generated, and committed: a page is served as it is written
// and runs sandboxed with no way to read reference/, so the sample the test
// bench shows has to be in the page's own folder. The test suite runs the
// presets over these samples and fails while the rules and the text disagree
// — and, where reference/ is still there, over whole forms as captured.
//
// A paragraph is kept when it says something a guardrail rule looks for, and
// the heading above it is kept with it: that is what makes the sample read
// like the prompt it came from without being all of it.
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = import.meta.dir ?? dirname(fileURLToPath(import.meta.url))
const root = join(here, "..")
const refDir = join(root, "reference")
const samplesPath = join(root, "page", "samples.js")

// what a kept paragraph has to say: every clause the packs target, and
// nothing else. Kept as one list so a rule and the reason it exists stay
// beside each other.
const WANTED = [
  /IMPORTANT:/,
  /authorized\s+security\s+testing/i,
  /dual-use\s+security\s+tools/i,
  /require[s]?\s+clear\s+authorization/i,
  /refuse\s+requests?\s+for\s+destructive/i,
  /prompt\s+injection/i,
  /Executing\s+actions\s+with\s+care/i,
  /check\s+with\s+the\s+user\s+before\s+proceeding/i,
  /always\s+confirm\s+first/i,
  /Authorization\s+stands\s+for\s+the\s+scope\s+specified/i,
  /Examples\s+of\s+the\s+kind\s+of\s+risky\s+actions/i,
  /^\s*-\s*(Destructive\s+operations|Hard-to-reverse\s+operations|Actions\s+visible\s+to\s+others|Uploading\s+content\s+to\s+third-party)/m,
  /confirm\s+first\s+unless\s+durably\s+authorized/i,
  /Sending\s+content\s+to\s+an\s+external\s+service\s+publishes\s+it/i,
  /Before\s+deleting\s+or\s+overwriting,\s+look\s+at\s+the\s+target/i,
]

// The caution an agent's own prompt carries about changing things: about the
// owner's own work being safe to do, not about what work may be done. These
// are never removed while a preset is on, whatever the packs catch — taking
// them out is what makes an agent careless with the owner's repository, not
// what makes it stop refusing.
const CAUTION = [
  "reversibility and blast radius",
  "confirm first",
  "approval in one context",
  "before deleting or overwriting",
  "reversible step",
  "uncommitted",
  "bypassing safety checks",
  "as a shortcut",
  "look at the target",
  "publishes it",
  "cached or indexed",
  "report outcomes faithfully",
]

// what each target is, and what its preset turns on. The rule ids are the
// engine's own; the test suite fails if one of them stops existing.
const TARGETS = [
  {
    id: "claude-code",
    name: "Claude Code",
    packs: ["work-restrictions", "claude-code"],
    source: "Claude Code, the interactive CLI",
    // the rules written for this target's own wording; the generic
    // work-restrictions pack is checked by cases.json and by the gone/kept
    // lists below, which are the thing that actually has to hold
    rules: [
      "cc-authorized-testing",
      "cc-refuse-destructive",
      "cc-dual-use",
      "cc-injection-flag",
    ],
    keep: CAUTION,
    // what the extraction is for: these must be gone from what is sent, and
    // these must still be in it. `--check` and the test suite fail on either,
    // holding each probe to the form of the prompt it is actually in.
    gone: [
      "authorized security testing",
      "Dual-use security tools",
      "Refuse requests for destructive",
      "attempt at prompt injection",
    ],
    kept: [
      "Executing actions with care",
      "reversibility and blast radius",
      "check with the user before proceeding",
      "always confirm first",
      "Authorization stands for the scope specified",
      "Examples of the kind of risky actions",
      "Destructive operations: deleting files",
      "rather than bypassing safety checks",
      "OWASP top 10",
      "Only use emojis",
      "confirm first unless durably authorized",
      "approval in one context",
      "Sending content to an external service publishes it",
      "Before deleting or overwriting, look at the target",
      "Report outcomes faithfully",
      "file_path:line_number",
    ],
    keepline: [/Tone and style/i, /Only use emojis/i, /short and concise/i, /OWASP top 10/i],
    what: {
      en: "The IMPORTANT block that tells the agent to refuse destructive techniques and to demand clear authorization before dual-use security work, and the \"suspected prompt injection\" line that tells it to stop and flag a tool result. Both stand in each form of the prompt — the full one and the simple one this engine sends for a model outside Anthropic's roster. The caution stays in both: the \"Executing actions with care\" section, \"confirm first unless durably authorized\", \"before deleting or overwriting, look at the target\". The OWASP bullet and \"Only use emojis\" are left alone too: they are good practice, not a fence.",
      zh: "「拒绝破坏性技术、双用途安全工作需明确授权」的那段 IMPORTANT 声明，以及工具结果疑似注入时「停下来、先向用户报告」的那条——两种形态的提示词里（完整版，以及本机这类非 Anthropic 名单模型拿到的精简版）都在。谨慎条款两版都保留：「Executing actions with care」小节、「confirm first unless durably authorized」、「删改之前先看清楚目标」。OWASP 那条和「只在明确要求时用 emoji」同样保留——那是良好实践，不是围栏。",
    },
  },
  {
    id: "claude-desktop",
    name: "Claude Desktop",
    packs: ["work-restrictions", "claude-desktop"],
    source: "Claude Desktop, the Claude Code engine it ships",
    rules: [
      "ccd-authorized-testing",
      "ccd-refuse-destructive",
      "ccd-dual-use",
      "ccd-injection-flag",
    ],
    keep: CAUTION,
    gone: [
      "authorized security testing",
      "Dual-use security tools",
      "Refuse requests for destructive",
      "attempt at prompt injection",
    ],
    kept: [
      "Executing actions with care",
      "reversibility and blast radius",
      "check with the user before proceeding",
      "always confirm first",
      "Authorization stands for the scope specified",
      "Examples of the kind of risky actions",
      "Destructive operations: deleting files",
      "rather than bypassing safety checks",
      "OWASP top 10",
      "Only use emojis",
      "confirm first unless durably authorized",
      "approval in one context",
      "Sending content to an external service publishes it",
      "Before deleting or overwriting, look at the target",
      "Report outcomes faithfully",
      "file_path:line_number",
    ],
    keepline: [/Report outcomes faithfully/i, /file_path:line_number/, /# Environment/i, /Write code that reads like the surrounding code/i],
    what: {
      en: "The desktop app's own engine build, which writes one more style line than the CLI's (\"Write code that reads like the surrounding code\") and leaves it alone. Its prompt comes in the same two forms: the IMPORTANT block goes in both, and the \"suspected prompt injection\" line in the full one. The harness's caution stays in both — \"confirm first unless durably authorized\", \"sending content to an external service publishes it\", \"before deleting or overwriting, look at the target\", \"report outcomes faithfully\" — and \"Report outcomes faithfully\" is not a fence: being honest about a failed test is not one.",
      zh: "桌面端自带的引擎构建：比 CLI 多写一行代码风格（「匹配周围代码的风格」），这行保留不动。它的提示词同样是两种形态：`IMPORTANT:` 声明两版都删，工具结果疑似注入那条只在完整版里删。桌面 harness 的谨慎条款两版都保留——「confirm first unless durably authorized」「发往外部服务就等于公开」「删改之前先看清目标」「如实报告结果」；「如实报告结果」不是围栏：测试失败就照实说，那不是限制。",
    },
  },
]

// wanted is whether a text says something a target's rules are about. The
// gone/kept probes are in here too, so the excerpt always carries every
// string the invariants talk about and the test bench can show all of them.
function wanted(s, target) {
  if (WANTED.some((re) => re.test(s)) || target.keepline.some((re) => re.test(s))) return true
  return [...(target.gone || []), ...(target.kept || [])].some((probe) => s.includes(probe))
}

const onlyHeading = (p) => /^\s{0,3}#{1,6}\s+\S+\s*$/.test(p)

// excerpt is the part of a captured prompt a target's rules are about: the
// lines that say something a rule looks for, the heading over them, and the
// heading that ends the section the last of them is in. What is left out is
// marked […], so the sample reads like the prompt it came from without being
// all of it.
//
// The ending heading matters: a heading is what stops a dropped section, so
// without one the removal the preset is about would run to the end of the
// sample and the page would show something the gateway never would.
function excerpt(text, target) {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trimEnd()).filter((p) => p.trim())
  const out = []
  let last = -1
  for (let i = 0; i < paragraphs.length; i++) {
    const lines = paragraphs[i].split("\n")
    // a whole paragraph for a sentence of it, one line at a time for a list
    const kept = lines.length === 1 && wanted(lines[0], target) ? lines : lines.filter((l) => wanted(l, target))
    if (!kept.length) continue
    // the heading on its own line above a thing kept goes with it
    if (i > 0 && onlyHeading(paragraphs[i - 1]) && !out.includes(paragraphs[i - 1])) out.push(paragraphs[i - 1])
    const head = /^\s{0,3}#{1,6}\s+\S/.test(lines[0]) && kept[0] !== lines[0] ? [lines[0]] : []
    out.push([...head, ...kept].join("\n"))
    last = i
  }
  if (last < 0) return ""
  for (let i = last + 1; i < paragraphs.length; i++) {
    const first = paragraphs[i].split("\n")[0]
    if (/^\s{0,3}#{1,6}\s+\S/.test(first)) {
      out.push(first)
      break
    }
  }
  return out.join("\n\n    […]\n\n")
}

// promptBody is the captured prompt without the header block the engine
// writes its own version into: an extractor writes the blocks it caught as
// one file, and the prompt is everything after the first
const promptBody = (raw) => (raw.includes("===== BLOCK =====") ? raw.split("===== BLOCK =====").slice(1).join("") : raw)

// FORM_FILES is the forms a capture can hold, in the order they are worth
// showing: the full prompt first, then the simple one. A capture from an
// engine that sends only one form has just the plain file, and is read as
// the one form it is.
const FORM_FILES = ["full", "simple"]

function readTarget(target) {
  const metaFile = join(refDir, `${target.id}.json`)
  const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, "utf8")) : {}
  const forms = []
  for (const form of FORM_FILES) {
    const file = join(refDir, `${target.id}.system.${form}.txt`)
    if (!existsSync(file)) continue
    const sample = excerpt(promptBody(readFileSync(file, "utf8")), target)
    if (sample.trim()) forms.push({ id: form, sample })
  }
  if (forms.length) {
    // the same form twice is one form: an engine that ignores the switch, or
    // a capture taken before there were two
    const unique = forms.filter((f, i) => forms.findIndex((x) => x.sample === f.sample) === i)
    // the card shows the form this engine sends on its own — the prompt it
    // really sends — and the other one rides beside it for the tests and
    // --check; a capture that did not record which is which keeps the full
    // one first
    const onOwn = unique.findIndex((f) => f.id === meta.onOwn)
    if (onOwn > 0) unique.unshift(unique.splice(onOwn, 1)[0])
    return { target, meta, forms: unique }
  }
  const plain = join(refDir, `${target.id}.system.txt`)
  if (!existsSync(plain)) return null
  const sample = excerpt(promptBody(readFileSync(plain, "utf8")), target)
  return sample.trim() ? { target, meta, forms: [{ id: "captured", sample }] } : null
}

// previous is what the page already carries, read before this run replaces
// it: a target without a capture keeps its entry rather than losing it
const previous = (() => {
  if (!existsSync(samplesPath)) return {}
  try {
    const box = {}
    new Function("globalThis", readFileSync(samplesPath, "utf8"))(box)
    return Object.fromEntries((box.PromptGuardPresets || []).map((p) => [p.id, p]))
  } catch (err) {
    console.error("page/samples.js could not be read back: " + err.message)
    return {}
  }
})()

const found = TARGETS.map((target) => ({ target, read: readTarget(target) }))
const missing = []
for (const entry of found) if (!entry.read && !previous[entry.target.id]) missing.push(entry.target.id)
if (missing.length) {
  console.error(`no capture in reference/ for: ${missing.join(", ")}`)
  console.error("run `node scripts/extract-guardrails.mjs` first, or copy a capture in by hand")
  process.exit(1)
}

const lit = (s) => JSON.stringify(s)
const line = (k, s) => `    ${k}: ${s},`

function entryOf(target, forms, meta) {
  const head = []
  head.push(line("id", lit(target.id)))
  head.push(line("name", lit(target.name)))
  head.push(line("packs", `[${target.packs.map(lit).join(", ")}]`))
  head.push(line("keep", `[${target.keep.map(lit).join(", ")}]`))
  head.push(line("gone", `[${target.gone.map(lit).join(", ")}]`))
  head.push(line("kept", `[${target.kept.map(lit).join(", ")}]`))
  head.push(line("source", lit([target.source, meta.version, meta.entrypoint].filter(Boolean).join(" · "))))
  head.push(line("captured", lit(meta.captured || "")))
  head.push(line("rules", `[${target.rules.map(lit).join(", ")}]`))
  head.push(line("what", JSON.stringify(target.what, null, 2).split("\n").join("\n    ")))
  head.push(line("sample", lit(forms[0].sample)))
  head.push(line("variants", `[\n${forms.map((f) => `      { ${line("id", lit(f.id)).trim()} ${line("sample", lit(f.sample)).trim()} },`).join("\n")}\n    ]`))
  return `  {\n${head.join("\n")}\n  },`
}

// carried is an entry this machine has no capture for: what the page already
// had, written back as it was
function carriedOf(old) {
  const head = []
  head.push(line("id", lit(old.id)))
  head.push(line("name", lit(old.name)))
  head.push(line("packs", `[${(old.packs || []).map(lit).join(", ")}]`))
  head.push(line("keep", `[${(old.keep || []).map(lit).join(", ")}]`))
  head.push(line("gone", `[${(old.gone || []).map(lit).join(", ")}]`))
  head.push(line("kept", `[${(old.kept || []).map(lit).join(", ")}]`))
  head.push(line("source", lit(old.source || "")))
  head.push(line("captured", lit(old.captured || "")))
  head.push(line("rules", `[${(old.rules || []).map(lit).join(", ")}]`))
  head.push(line("what", JSON.stringify(old.what, null, 2).split("\n").join("\n    ")))
  head.push(line("sample", lit(old.sample)))
  return `  {\n${head.join("\n")}\n  },`
}

const entries = found.map(({ target, read }) => read ? entryOf(target, read.forms, read.meta) : carriedOf(previous[target.id]))

const file = `// The two Claude presets: the guardrail-bearing text of each target's own
// system prompt, and the rules that take it out.
//
// GENERATED FILE — do not edit. \`node scripts/make-samples.mjs\` writes it
// from what scripts/extract-guardrails.mjs captured into reference/, so the
// samples are verbatim the prompt the target sent, with the paragraphs
// between them marked […] where the rest of the prompt was left out. The
// capture itself is not in the repository; the page is served as it is
// written and runs sandboxed with no way to read it, so the sample the test
// bench shows has to be here.
//
// Each preset carries the forms of its prompt its capture held under
// \`variants\` — the full prompt, and the simple one the engine sends for a
// model outside Anthropic's roster. \`sample\` is the first of them and is
// what the page shows: the form this engine sends on its own, so the card
// demonstrates the prompt the machine really sends; the other form is held
// beside it. A preset whose capture this machine does not have is carried
// over as it was, with no \`variants\`: its \`sample\` is the one form that was
// captured.
//
// The test suite runs each preset over every form and fails when the rules
// and the text stop agreeing.
globalThis.PromptGuardPresets = [
${entries.join("\n")}
]
`

writeFileSync(samplesPath, file)
for (const { target, read } of found) {
  if (!read) {
    console.log(`${target.id}: no capture on this machine — kept the entry page/samples.js already had`)
    continue
  }
  console.log(`${target.id}: ${read.forms.map((f) => `${f.id} ${f.sample.length}`).join(", ")} chars of excerpt${read.meta.version ? " (" + read.meta.version + ")" : ""}`)
}
console.log("page/samples.js written")