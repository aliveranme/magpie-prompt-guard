// What the page says and how it shapes the options, without the DOM, so a
// test can check it. A classic script: it sets globalThis.PromptGuardView.
//
// The page and the gateway read one options object: what this page saves is
// what ctx.options holds on the next request, a second or two later. The page
// writes only what was changed — a pack turned off, a rule turned off or
// edited, a scope given an action — and leaves the rest out, so plugins.json
// stays short and a rule magpie adds later arrives with an update rather than
// being frozen into the file.
(() => {
  const SCOPE_ORDER = ["user", "tool", "system", "assistant"]
  const ACTION_ORDER = ["off", "flag", "neutralize", "reject"]
  const UNIT_ORDER = ["sentence", "line", "block"]
  const BENCH_ROLES = ["system", "user", "tool"]

  const TEXT = {
    en: {
      title: "Prompt guard",
      lede: "Filters what this gateway sends. Your rules keep injection phrases out of a request; the guardrail rules take the refusal-making boilerplate out of an agent's own system prompt.",
      on: "On", off: "Off",
      saved: "Saved", saving: "Saving…", unsaved: "Not saved yet", failed: "Couldn't save",
      tabInjection: "Injection", tabGuardrails: "Guardrails", tabBench: "Test bench",
      injLede: "What each kind of turn is read for. What a rule matches is replaced by the mask, written to the log, or turned away with an error — before the request is routed.",
      scopes: "Scopes",
      scopeUser: "User turns", scopeTool: "Tool results", scopeSystem: "System prompt", scopeAssistant: "Assistant turns",
      mask: "Replacement", maskHint: "empty takes the match out",
      status: "Reject status", message: "Reject message", messageHint: "empty uses the rule's name",
      packs: "Rule packs", rules: "Rules",
      rulePattern: "Pattern", ruleAction: "Action",
      addRule: "Add a rule", revert: "Put back", mine: "Mine", builtIn: "Built in",
      removed: "Removed", removeRule: "Turn this rule off",
      noPattern: "no pattern yet",
      badPattern: "this pattern will not compile, so it is ignored",
      actionOff: "Off", actionFlag: "Log only", actionNeutralize: "Replace", actionReject: "Turn away",
      actInherit: "As the scope",
      scopeAny: "Every scope read", scopeOnly: "Only ",
      grLede: "What comes out of the texts below before they are sent. A rule marks a clause; the unit decides how much of it goes — the sentence, the whole line, or the paragraph.",
      grOn: "Strip guardrails", grUnit: "Unit", grSections: "A matched heading takes its whole section",
      unitSentence: "Sentence", unitLine: "Line", unitBlock: "Paragraph",
      keep: "Never remove", keepHint: "one expression a line; what it matches stays",
      grScopes: "Reads",
      benchLede: "Paste a prompt and see what the rules do to it. This runs in the page on the same engine the gateway runs, so it answers as the gateway would — nothing here reaches the network.",
      benchRole: "Read as", benchIn: "Text", benchOut: "After the rules", benchHits: "What fired",
      benchNothing: "Nothing fired.", benchPlaceholder: "Paste a system prompt or a user turn…",
      benchRemoved: "Removed", benchReplaced: "Replaced",
      benchReject: "This request would be turned away",
      raw: "Options as JSON", rawHint: "what this page writes to plugins.json",
      words: { user: "user", tool: "tool", system: "system", assistant: "assistant" },
    },
    zh: {
      title: "提示词守卫",
      lede: "过滤经本网关发出的内容。自定义规则把提示词注入的句式挡在请求之外；安全围栏规则把 agent 自带、导致模型频繁拒答的样板条款从系统提示词里剔出去。",
      on: "已启用", off: "已停用",
      saved: "已保存", saving: "保存中…", unsaved: "尚未保存", failed: "保存失败",
      tabInjection: "注入拦截", tabGuardrails: "安全围栏", tabBench: "试验台",
      injLede: "各类文本何时被读取。规则命中的内容会被替换、仅记入日志，或直接以错误拒绝——都在请求路由之前完成。",
      scopes: "作用范围",
      scopeUser: "用户消息", scopeTool: "工具结果", scopeSystem: "系统提示词", scopeAssistant: "助手回复",
      mask: "替换文本", maskHint: "留空则直接删除匹配内容",
      status: "拒绝状态码", message: "拒绝提示语", messageHint: "留空则使用规则名",
      packs: "规则包", rules: "规则",
      rulePattern: "匹配模式", ruleAction: "动作",
      addRule: "新增规则", revert: "恢复默认", mine: "自建", builtIn: "内置",
      removed: "已关闭", removeRule: "关闭此规则",
      noPattern: "尚未填写模式",
      badPattern: "该正则无法编译，会被忽略",
      actionOff: "不处理", actionFlag: "仅记录", actionNeutralize: "替换", actionReject: "拒绝请求",
      actInherit: "随范围",
      scopeAny: "所有被读取的范围", scopeOnly: "仅 ",
      grLede: "在文本发出前要剔除的内容。规则只负责标记，剔除多少由「单元」决定——整句、整行，或整段。",
      grOn: "剔除安全围栏", grUnit: "剔除单元", grSections: "命中的标题连同整节一起删除",
      unitSentence: "整句", unitLine: "整行", unitBlock: "整段",
      keep: "永不剔除", keepHint: "每行一条正则，命中的内容一定保留",
      grScopes: "读取范围",
      benchLede: "粘贴一段提示词，直接看规则会怎么处理。这里跑的是与网关同一份引擎，结果与真正发出的内容一致——页面不联网。",
      benchRole: "按以下身份解读", benchIn: "原文", benchOut: "处理后", benchHits: "命中的规则",
      benchNothing: "没有命中任何规则。", benchPlaceholder: "粘贴系统提示词或用户消息…",
      benchRemoved: "已剔除", benchReplaced: "已替换",
      benchReject: "该请求会被拒绝",
      raw: "选项 JSON", rawHint: "页面保存时写入 plugins.json 的内容",
      words: { user: "用户", tool: "工具", system: "系统", assistant: "助手" },
    },
  }

  function text(lang) {
    return String(lang || "").toLowerCase().startsWith("zh") ? TEXT.zh : TEXT.en
  }

  function clone(v) {
    return v === undefined ? undefined : JSON.parse(JSON.stringify(v))
  }

  function compiles(pattern) {
    if (typeof pattern !== "string" || !pattern) return false
    try {
      new RegExp(pattern)
      return true
    } catch (err) {
      return false
    }
  }

  // ---------------------------------------------------------------------
  // reading the options
  // ---------------------------------------------------------------------

  // rules is the rule list the editor draws, worked out by the engine's own
  // book, so the page and the gateway can never disagree about what exists
  function rules(E, kind, state) {
    return E.rulesFor(kind, state && state[kind]).map((r) => ({ ...r, ok: compiles(r.pattern) }))
  }

  // packs is a kind's rule packs, in the book's order, with whether each is
  // on now: a pack is on unless the file says it is off
  function packs(E, kind, state) {
    const book = kind === "guardrails" ? E.GUARDRAIL_PACKS : E.INJECTION_PACKS
    const off = kind === "guardrails" ? E.PACKS_OFF : null
    const s = state && state[kind] && typeof state[kind] === "object" ? state[kind] : {}
    const named = s.packs && typeof s.packs === "object" ? s.packs : null
    return Object.keys(book).map((id) => ({
      id,
      count: book[id].length,
      on: named ? named[id] !== false : !(off && off[id]),
    }))
  }

  // scopeActions is what each kind of turn is read for now, with the
  // gateway's own answer where the options name none
  function scopeActions(state, kind) {
    const given = state && state[kind] && state[kind].scopes && typeof state[kind].scopes === "object" ? state[kind].scopes : {}
    const out = {}
    for (const s of SCOPE_ORDER) {
      const fallback = kind === "guardrails"
        ? (s === "system" ? true : false)
        : (s === "user" || s === "tool" ? "neutralize" : "off")
      const v = given[s]
      out[s] = v === undefined ? fallback : v
    }
    return out
  }

  function guardOn(state) {
    return !(state && state.guardrails && state.guardrails.on === false)
  }

  function guardUnit(state) {
    const u = state && state.guardrails && state.guardrails.unit
    return UNIT_ORDER.indexOf(u) >= 0 ? u : "sentence"
  }

  function guardSections(state) {
    return !(state && state.guardrails && state.guardrails.sections === false)
  }

  function injectionSpec(state) {
    const s = state && state.injection && typeof state.injection === "object" ? state.injection : {}
    return {
      mask: typeof s.mask === "string" ? s.mask : "[filtered]",
      status: Number(s.status) > 0 ? Number(s.status) : 400,
      message: typeof s.message === "string" ? s.message : "",
    }
  }

  function enabled(state) {
    return !(state && state.enabled === false)
  }

  // keepList is the expressions that protect a clause: the owner's when they
  // set any, the engine's own otherwise
  function keepList(E, state) {
    const given = state && state.guardrails && state.guardrails.keep
    if (Array.isArray(given)) return given.slice()
    return (E.DEFAULT_KEEP || []).slice()
  }

  function keepsText(E, state) {
    return keepList(E, state).join("\n")
  }

  // ---------------------------------------------------------------------
  // writing the options — what was changed, and nothing else
  // ---------------------------------------------------------------------

  function kindSpec(state, kind) {
    if (!state[kind] || typeof state[kind] !== "object") state[kind] = {}
    const s = state[kind]
    if (!s.packs || typeof s.packs !== "object") s.packs = {}
    if (!Array.isArray(s.rules)) s.rules = []
    return s
  }

  // put writes a value, or takes the key out when the value is the engine's
  // own default: what is left out is what an update may change
  function put(obj, key, value, untouched) {
    if (value === undefined || value === null || value === untouched) delete obj[key]
    else obj[key] = value
    return obj
  }

  function setScope(state, kind, scope, action) {
    const s = kindSpec(state, kind)
    if (!s.scopes || typeof s.scopes !== "object") s.scopes = {}
    s.scopes[scope] = action
    return state
  }

  function setPack(state, kind, pack, on) {
    const s = kindSpec(state, kind)
    if (on) delete s.packs[pack]
    else s.packs[pack] = false
    return state
  }

  function ruleAt(s, id) {
    for (const r of s.rules) if (r && r.id === id) return r
    return null
  }

  function setRule(state, kind, id, patch) {
    const s = kindSpec(state, kind)
    let r = ruleAt(s, id)
    if (!r) {
      r = { id }
      s.rules.push(r)
    }
    for (const k of Object.keys(patch)) put(r, k, patch[k])
    return state
  }

  // dropRule takes one of the owner's rules away. A pack's rule cannot go —
  // it lives in the engine — so it is turned off in the file instead.
  function dropRule(state, kind, id, isPack) {
    const s = kindSpec(state, kind)
    s.rules = s.rules.filter((r) => !r || r.id !== id)
    if (isPack) s.rules.push({ id, on: false })
    return state
  }

  // revertRule puts a rule back to what the engine says it is: on for a
  // pack's rule, gone for the owner's
  function revertRule(state, kind, id) {
    const s = kindSpec(state, kind)
    s.rules = s.rules.filter((r) => !r || r.id !== id)
    return state
  }

  function addRule(state, kind) {
    const s = kindSpec(state, kind)
    let n = 1
    while (ruleAt(s, "mine-" + n)) n++
    const id = "mine-" + n
    s.rules.push({ id, name: "", pattern: "" })
    return id
  }

  function setEnabled(state, on) {
    if (on) delete state.enabled
    else state.enabled = false
    return state
  }

  // setInjection is one key of the injection options. The mask is written
  // even when it is empty — an empty mask is how a match is deleted rather
  // than replaced; writing the default back takes the key out.
  function setInjection(state, kind, key, v, untouched) {
    if (!state.injection || typeof state.injection !== "object") state.injection = {}
    return put(state.injection, key, v, untouched)
  }

  function setGuard(state, kind, key, v, untouched) {
    if (!state.guardrails || typeof state.guardrails !== "object") state.guardrails = {}
    return put(state.guardrails, key, v, untouched)
  }

  function setGuardScope(state, kind, scope, on) {
    if (!state.guardrails || typeof state.guardrails !== "object") state.guardrails = {}
    const s = state.guardrails
    if (!s.scopes || typeof s.scopes !== "object") s.scopes = {}
    // system is read by default, the other three are not: writing the
    // default back would freeze it into the file
    const fallback = scope === "system"
    if (on === fallback) delete s.scopes[scope]
    else s.scopes[scope] = on
    return state
  }

  // setKeeps writes the list, or takes the key out when the list is the
  // engine's own, so an update can change the default
  function setKeeps(state, kind, list, defaultList) {
    if (!state.guardrails || typeof state.guardrails !== "object") state.guardrails = {}
    const d = defaultList || []
    const same = list.length === d.length && list.every((w, i) => w === d[i])
    if (same) delete state.guardrails.keep
    else state.guardrails.keep = list
    return state
  }

  // ---------------------------------------------------------------------
  // the test bench
  // ---------------------------------------------------------------------

  // bench works one text as the gateway would, and says what came of it:
  // the text afterwards, what fired, and whether the request would be
  // turned away rather than sent
  function bench(E, state, given, role) {
    const r = BENCH_ROLES.indexOf(role) >= 0 ? role : "user"
    const res = E.previewText(given, state, r)
    const hits = (res.hits || []).map((h) => ({
      id: h.id,
      name: h.name || h.id,
      pack: h.pack || "",
      unit: h.unit || "",
      action: h.action || "",
      match: h.match,
    }))
    const given_ = state && state.injection && typeof state.injection === "object" ? state.injection.status : 0
    const status = Number(given_) > 0 ? Number(given_) : 400
    return {
      out: res.out,
      changed: res.out !== given,
      removed: r === "system",
      rejected: r === "system" || !hits.some((h) => h.action === "reject") ? 0 : status,
      hits,
    }
  }

  globalThis.PromptGuardView = {
    TEXT, SCOPE_ORDER, ACTION_ORDER, UNIT_ORDER, BENCH_ROLES,
    text, clone, compiles,
    rules, packs, scopeActions, guardOn, guardUnit, guardSections, injectionSpec, enabled, keepList, keepsText,
    setScope, setPack, setRule, dropRule, revertRule, addRule, setEnabled,
    setInjection, setGuard, setGuardScope, setKeeps,
    bench,
  }
})()
