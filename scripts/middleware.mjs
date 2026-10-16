// Runs a gateway middleware's cases the way magpie's gateway calls it: one
// ctx for the request's hooks, each body a fresh copy of its JSON, and
// \`undefined\` from a hook leaving the bytes as they were.
//
// The same cases.json is run twice — once through the module the gateway
// loads, once through the page's generated copy of it — so the two can never
// answer differently.
import { readFileSync } from "node:fs"

export function loadCases(path) {
  return JSON.parse(readFileSync(path, "utf8"))
}

// runHook gives one case's request to onRequest and says what came back:
// { request } as the gateway would send it, or { reject }.
export function runHook(mod, c) {
  const m = mod.default ?? mod
  let rejected
  const ctx = {
    protocol: "anthropic", model: "", stream: false, path: "",
    ...(c.ctx ?? {}),
    options: c.options ?? {},
    state: {},
    reject(status, message) { rejected ??= { status, message } },
  }
  const copy = (v) => JSON.parse(JSON.stringify(v))
  const out = {}
  if (c.request) {
    const r = m.onRequest ? m.onRequest(copy(c.request), ctx) : undefined
    if (rejected) out.reject = rejected
    else out.request = r === undefined ? c.request : copy(r)
  }
  return out
}

// loadPageEngine runs page/engine.js as a browser would: a classic script
// that puts what it exports on globalThis.
export function loadPageEngine(path) {
  const box = {}
  new Function("globalThis", readFileSync(path, "utf8"))(box)
  if (!box.PromptGuard) throw new Error("page/engine.js set nothing on globalThis.PromptGuard")
  return box.PromptGuard
}
