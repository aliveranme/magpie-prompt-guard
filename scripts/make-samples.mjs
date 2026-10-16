// Writes page/samples.js from the captures the extractor left in
// reference/ — the guardrail-bearing paragraphs of each target's own system
// prompt, and the rules that take them out.
//
//   node scripts/extract-guardrails.mjs        capture, then write this
//   node scripts/make-samples.mjs              write it from what is there
//
// The file is generated, and committed: a page is served as it is written
// and runs sandboxed with no way to read reference/, so the sample the test
// bench shows has to be in the page's own folder. The test suite runs the
// presets over these samples and fails while the rules and the text disagree
// — and, where reference/ is still there, over the whole prompt as captured.
//
// A paragraph is kept when it says something a guardrail rule looks for, and
// the heading above it is kept with it: that is what makes the sample read
// like the prompt it came from without being all of it.
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = import.meta.dir ?? dirname(fileURLToPath(import.meta.url))
const root = join(here, "..")
const refDir = join(root, "reference")

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

// what each target is, and what its preset turns on. The rule ids are the
// engine's own; the test suite fails if one of them stops existing.
const TARGETS = [
  {
    id: "claude-code",
    name: "Claude Code",
    pack: "claude-code",
    source: "Claude Code, the interactive CLI",
    rules: [
      "cc-authorized-testing",
      "cc-refuse-destructive",
      "cc-dual-use",
      "cc-injection-flag",
      "cc-actions-with-care",
      "cc-confirm-first",
      "cc-risky-actions",
    ],
    keepline: [/Tone and style/i, /Only use emojis/i, /short and concise/i, /OWASP top 10/i],
    what: {
      en: "The IMPORTANT block that tells the agent to refuse destructive techniques and to demand clear authorization before dual-use security work, the \"flag it to the user\" line about injected tool results, and the whole \"Executing actions with care\" section — the one that makes it ask before every outward step. The OWASP bullet and \"Only use emojis\" are left alone: they are good practice, not a fence.",
      zh: "「拒绝破坏性技术、双用途安全工作需明确授权」的那段 IMPORTANT 声明，工具结果疑似注入时「先向用户报告」的那条，以及整个「Executing actions with care」小节（就是它让 agent 每做一步都要先问一遍）。OWASP 那条和「只在明确要求时用 emoji」会保留——那是良好实践，不是围栏。",
    },
  },
  {
    id: "claude-desktop",
    name: "Claude Desktop",
    pack: "claude-desktop",
    source: "Claude Desktop, the Claude Code engine it ships",
    rules: [
      "ccd-authorized-testing",
      "ccd-refuse-destructive",
      "ccd-dual-use",
      "ccd-confirm-first",
      "ccd-publish",
      "ccd-inspect-first",
    ],
    keepline: [/Report outcomes faithfully/i, /file_path:line_number/, /# Environment/i],
    what: {
      en: "The same IMPORTANT block, and the desktop harness's own line about confirming before anything hard to reverse or outward-facing — plus \"sending content to an external service publishes it\" and \"before deleting or overwriting, look at the target\". \"Report outcomes faithfully\" stays: being honest about a failed test is not a fence.",
      zh: "同一段 IMPORTANT 声明，加上桌面版 harness 自己那句「不可逆或对外的动作先确认」——以及「发往外部服务就等于公开」「删改之前先看清楚目标」。而「如实报告结果」会保留：测试失败就照实说，那不是围栏。",
    },
  },
]

// wanted is whether a text says something a target's rules are about
function wanted(s, target) {
  return WANTED.some((re) => re.test(s)) || target.keepline.some((re) => re.test(s))
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

function readTarget(target) {
  const file = join(refDir, `${target.id}.system.txt`)
  if (!existsSync(file)) return null
  const metaFile = join(refDir, `${target.id}.json`)
  const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, "utf8")) : {}
  const raw = readFileSync(file, "utf8")
  // an extractor writes the blocks it caught as one file; the prompt is
  // everything after its own header
  const body = raw.includes("===== BLOCK =====") ? raw.split("===== BLOCK =====").slice(1).join("") : raw
  return { target, sample: excerpt(body, target), meta }
}

const CAPTURED = existsSync(join(refDir, "captured.json")) ? JSON.parse(readFileSync(join(refDir, "captured.json"), "utf8")) : {}
const found = TARGETS.map(readTarget)
const missing = found.filter((f) => !f || !f.sample.trim()).map((f, i) => TARGETS[i].id)
if (missing.length) {
  console.error(`no capture in reference/ for: ${missing.join(", ")}`)
  console.error("run `node scripts/extract-guardrails.mjs` first, or copy a capture in by hand")
  process.exit(1)
}

const lit = (s) => JSON.stringify(s)
const entries = found.map(({ target, sample, meta }) => {
  const head = []
  head.push(`    id: ${lit(target.id)},`)
  head.push(`    name: ${lit(target.name)},`)
  head.push(`    pack: ${lit(target.pack)},`)
  head.push(`    source: ${lit([target.source, meta.version, meta.entrypoint].filter(Boolean).join(" · "))},`)
  head.push(`    captured: ${lit(meta.captured || (CAPTURED[target.id] || {}).captured || "")},`)
  head.push(`    rules: [${target.rules.map(lit).join(", ")}],`)
  head.push(`    what: ${JSON.stringify(target.what, null, 2).split("\n").join("\n    ")},`)
  head.push(`    sample: ${lit(sample)},`)
  return `  {\n${head.join("\n")}\n  },`
})

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
// The test suite runs each preset over its own sample and fails when the
// rules and the text stop agreeing.
globalThis.PromptGuardPresets = [
${entries.join("\n")}
]
`

writeFileSync(join(root, "page", "samples.js"), file)
for (const { target, sample, meta } of found) {
  console.log(`${target.id}: ${sample.length} chars of excerpt${meta.version ? " (" + meta.version + ")" : ""}`)
}
console.log("page/samples.js written")
