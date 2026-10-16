// Generates page/engine.js: the page's own copy of the same engine.
//
// A plugin page runs in a frame sandboxed to scripts alone, with no network
// and no build step, so the test bench it draws has to carry its own copy of
// the matching. Rather than keep two engines in step by hand, this writes the
// page's from prompt-guard.middleware.js — one source of truth — and
// prompt-guard.test.mjs holds the two to the same answers, and fails while
// this file is out of step with what it would write.
//
//   bun run build      (or node scripts/sync-engine.mjs)
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = import.meta.dir ?? dirname(fileURLToPath(import.meta.url))
const root = join(here, "..")

const HEADER = `// The page's copy of prompt-guard's engine.
//
// GENERATED FILE — do not edit. It is prompt-guard.middleware.js with its
// \`export\` keywords taken off and its entry points put on
// \`globalThis.PromptGuard\`, so a page sandboxed away from the gateway can
// work the same rules on a text the reader pastes in. Change the middleware
// and run \`bun run build\`; prompt-guard.test.mjs fails while this file is
// out of step with it.
(() => {
`

const FOOTER_HEAD = "\nglobalThis.PromptGuard = { "

// exported is the names the middleware exports, read from its own source, so
// that a new entry point cannot be left out of the page's copy by hand — the
// page asking for one the copy does not have is a page that stops working
function exported(src) {
  const names = []
  const re = /^export\s+(?:async\s+)?(?:function|const|let|var)\s+([A-Za-z_$][\w$]*)/gm
  let m
  while ((m = re.exec(src)) !== null) if (names.indexOf(m[1]) < 0) names.push(m[1])
  return names
}

// rendered is what page/engine.js holds: the middleware with its three
// exports turned into plain functions in one scope, and the rule book, which
// the page's editor draws from, beside them
export function rendered() {
  const src = readFileSync(join(root, "prompt-guard.middleware.js"), "utf8")
  const names = exported(src)
  const footer = FOOTER_HEAD + names.join(", ") + " }\n})()\n"
  return HEADER + src.replace(/^export\s+/gm, "").trimEnd() + footer
}

export function enginePath() {
  return join(root, "page", "engine.js")
}

const isMain = typeof Bun !== "undefined"
  ? import.meta.main
  : process.argv[1] === fileURLToPath(import.meta.url)

if (isMain) {
  writeFileSync(enginePath(), rendered())
  console.log("page/engine.js written from prompt-guard.middleware.js")
}
