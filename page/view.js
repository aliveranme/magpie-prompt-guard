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
      tabInjection: "Injection", tabGuardrails: "Guardrails", tabBench: "Test bench", tabPresets: "Guardrail presets",
      presetsLede: "Guardrail sets taken from the agents' own system prompts. Each one was captured from the prompt the target actually sent, and the rules are held to it. Extracting shows, on a verbatim excerpt, exactly what it takes out.",
      presetSource: "Captured from", presetWhat: "What it removes", presetRules: "Rules",
      presetExtract: "Extract", presetClose: "Close", presetBench: "Open in the bench", presetApply: "Apply", presetApplied: "Applied",
      presetReport: "would be removed", presetOfExcerpt: "of this excerpt", presetNothing: "nothing — no rule fired",
      presetHits: "clauses", presetChars: "characters",
      presetGone: "Limits taken out", presetKept: "Caution kept",
      presetGoneList: "What must not reach the model", presetKeptList: "What must still be in it",
      budget: "Reading budget",
      budgetLede: "magpie gives a hook 250 ms and then carries on as if it were not there — a request it stopped reading is a request with no filtering at all. So the hook reads a bounded part of one: the system prompt first, then the turns newest first.",
      limitMs: "Time budget", limitMsHint: "milliseconds of reading per request (magpie allows 250)",
      limitText: "Largest single text", limitTextHint: "characters; a bigger one is not read at all",
      budgetTrace: "Log what each request cost",
      budgetTraceHint: "one line per request in magpie's log — turn the switch on, then",
      budgetWhy: "These are the settings. The numbers a reader wants — what was read, how long it took, what went unread — are in magpie's log, which is what the switch above is for.",
      benchStats: "Size", benchWithin: "within the single-text cap", benchOver: "over the single-text cap: the gateway skips this text",
      benchEstimate: "about {ms} ms to read, at the {rate} ms/KB measured in magpie's own engine",
      benchMode: "What to try", benchModeText: "One text", benchModeRequest: "A whole request",
      benchProtocol: "Protocol", benchRequestHint: "a request body, as the agent sends it",
      benchRead: "within text-size caps", benchSkipped: "over the per-text cap", benchBadJson: "that is not a JSON object",
      benchWould: "preview under the text-size cap",
      benchTimeHint: "This preview does not simulate maxMs. The live hook may stop earlier; check its per-request report for the actual result.",
      benchNotRead: "This text exceeds its size cap. The gateway skips it, so no transformed preview is shown.",
      presetMissed: "never fired on the capture:", presetExcerpt: "the excerpt it was extracted from", presetLeft: "what would be sent",
      presetCaveat: "The share is of this excerpt, which is the guardrail-bearing part of the prompt and not all of it; on the whole prompt it is 2–8%, because the fence is a couple of paragraphs out of a long one. The excerpt shown is the form the engine sends on its own; the rules are held to both forms. A preset only sets the guardrails' packs, unit and scopes — your keep list and your own rules are left as they are.",
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
      benchLede: "Paste text or a request to see which rules match. The preview enforces per-text size caps but cannot simulate magpie's wall-clock maxMs; live filtering may stop earlier. Nothing here reaches the network.",
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
      tabInjection: "注入拦截", tabGuardrails: "安全围栏", tabBench: "试验台", tabPresets: "围栏预设",
      presetsLede: "从各 agent 自己的系统提示词里提取出来的围栏条款。每一份都是目标真实发出的提示词，规则以它为基准校对。点「提取」可以看到它到底删掉了哪些原句。",
      presetSource: "抓取自", presetWhat: "会剔除什么", presetRules: "规则",
      presetExtract: "提取", presetClose: "收起", presetBench: "在试验台打开", presetApply: "应用", presetApplied: "已应用",
      presetReport: "将被剔除", presetOfExcerpt: "占本片段", presetNothing: "无——没有任何规则命中",
      presetGone: "已剔除的限制", presetKept: "已保留的谨慎条款",
      presetGoneList: "不允许送到模型的内容", presetKeptList: "必须原样保留的内容",
      budget: "读取预算",
      budgetLede: "magpie 给钩子 250ms，超时就把钩子当作不存在 —— 那意味着这个请求完全没过过滤。所以钩子只读请求的一部分：系统提示词优先，其余从最新一轮往前读。",
      limitMs: "时间预算", limitMsHint: "每个请求最多读多少毫秒（magpie 只给 250）",
      limitText: "单个文本上限", limitTextHint: "字符；更大的文本整段不读",
      budgetTrace: "在日志里记录每个请求的开销",
      budgetTraceHint: "每个请求一行，写进 magpie 日志 —— 打开开关后运行",
      budgetWhy: "这里是设置。真正想要的数字 —— 读了多少、花多久、跳过多少 —— 在 magpie 日志里，上面那个开关就是为它准备的。",
      benchStats: "体积", benchWithin: "未超单文本上限", benchOver: "超过单文本上限：网关会跳过这段文本",
      benchEstimate: "预计读取约 {ms} ms（按 magpie 引擎实测 {rate} ms/KB）",
      benchMode: "试什么", benchModeText: "单条文本", benchModeRequest: "整个请求",
      benchProtocol: "协议", benchRequestHint: "请求体，就是 agent 发出去的那个",
      benchRead: "未超单文本上限", benchSkipped: "超过单文本上限", benchBadJson: "不是合法的 JSON 对象",
      benchWould: "按文本上限生成的预览",
      benchTimeHint: "此预览不模拟 maxMs；实际钩子可能更早停止。实际结果请查看每请求日志。",
      benchNotRead: "该文本超过大小上限。网关会跳过它，因此不显示改写预览。",
      presetHits: "处命中", presetChars: "字符",
      presetMissed: "在真实抓取中未命中：", presetExcerpt: "提取所用的片段", presetLeft: "处理后实际发出的内容",
      presetCaveat: "这里的比例是相对本片段而言的——片段只截取了提示词中带围栏的那部分，对整份提示词是 2–8%：围栏只是长提示词里的两段。展示的是本机引擎默认发出的那一形态，规则对两种形态都校验。应用预设只会写入围栏的规则包、单元和范围，你的 keep 白名单与自建规则不会被改动。",
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
      benchLede: "粘贴文本或请求体，查看哪些规则会命中。预览会执行各文本大小上限，但无法模拟 magpie 的墙钟 maxMs；实际过滤可能更早停止。页面不会联网。",
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
  // on now: a pack the file names is on unless it says false, and one it
  // doesn't name is on unless it is off by default
  function packs(E, kind, state) {
    const book = kind === "guardrails" ? E.GUARDRAIL_PACKS : E.INJECTION_PACKS
    const off = kind === "guardrails" ? E.PACKS_OFF : null
    const s = state && state[kind] && typeof state[kind] === "object" ? state[kind] : {}
    const named = s.packs && typeof s.packs === "object" ? s.packs : null
    return Object.keys(book).map((id) => ({
      id,
      count: book[id].length,
      on: named && named[id] !== undefined ? named[id] !== false : !(off && off[id]),
    }))
  }

  // packDefault is whether a pack is on when the file says nothing about it
  function packDefault(E, kind, id) {
    if (kind !== "guardrails") return true
    return !(E.PACKS_OFF && E.PACKS_OFF[id])
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

  // ---------------------------------------------------------------------
  // what the hook is allowed to read, and what that costs
  // ---------------------------------------------------------------------

  // MOEJS_MS_PER_KB is what reading costs in the engine that runs the hook,
  // measured on a real gateway with every pack on: about 0.93 ms for a KB of
  // text. The page uses it to say roughly what a text would cost. The exact
  // number per request is what the trace option puts in magpie's log — a page
  // is a frame sandboxed away from the gateway, and nothing it can read
  // carries the hook's own counters.
  const MOEJS_MS_PER_KB = 0.93

  function limits(E, state) {
    return E.limitsOf(state && typeof state === "object" ? state : {})
  }

  function traceOn(state) {
    return !!(state && state.trace === true)
  }

  function setTrace(state, on) {
    if (on) state.trace = true
    else delete state.trace
    return state
  }

  function setLimit(state, key, value, fallback) {
    if (!state.limits || typeof state.limits !== "object") state.limits = {}
    put(state.limits, key, value, fallback)
    if (!Object.keys(state.limits).length) delete state.limits
    return state
  }

  // benchSize is a text against its role's cap and an estimate of reading cost.
  function benchSize(E, state, text, role) {
    const l = limits(E, state)
    const chars = typeof text === "string" ? text.length : 0
    const maxText = role === "system"
      ? l.maxSystemText || Math.max(l.maxText, 262144)
      : l.maxText
    return {
      chars,
      over: chars > maxText,
      maxText,
      // never "0 ms": the per-KB rate is the reading, and a call has
      // overhead besides, so a tiny text is still about a millisecond
      ms: Math.max(1, Math.round((chars / 1024) * MOEJS_MS_PER_KB)),
      rate: MOEJS_MS_PER_KB,
    }
  }

  // benchRequest previews the same rules and size cap as the hook. The
  // runtime-dependent maxMs cutoff is reported by the live hook instead.
  function benchRequest(E, state, json, protocol) {
    let body
    try {
      body = JSON.parse(json)
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) }
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "not an object" }
    const r = E.previewRequest(body, protocol, state && typeof state === "object" ? state : {})
    return { ok: true, body: r.body, hits: r.hits, read: r.read, skipped: r.skipped, limits: r.limits, timeBudgetApplied: r.timeBudgetApplied }
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

  // tidy takes out what a write left empty: an empty object is a line in
  // plugins.json that reads as if it meant something
  function tidy(state, kind) {
    const s = state[kind]
    if (!s || typeof s !== "object") return state
    for (const k of ["packs", "scopes", "rules"]) {
      const v = s[k]
      if (v && typeof v === "object" && !Object.keys(v).length) delete s[k]
    }
    if (!Object.keys(s).length) delete state[kind]
    return state
  }

  function setScope(state, kind, scope, action) {
    const s = kindSpec(state, kind)
    if (!s.scopes || typeof s.scopes !== "object") s.scopes = {}
    s.scopes[scope] = action
    return tidy(state, kind)
  }

  function setPack(state, kind, pack, on, defaultOn) {
    const s = kindSpec(state, kind)
    if (on === !!defaultOn) delete s.packs[pack]
    else s.packs[pack] = on
    return tidy(state, kind)
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
    return tidy(state, kind)
  }

  // dropRule takes one of the owner's rules away. A pack's rule cannot go —
  // it lives in the engine — so it is turned off in the file instead.
  function dropRule(state, kind, id, isPack) {
    const s = kindSpec(state, kind)
    s.rules = s.rules.filter((r) => !r || r.id !== id)
    if (isPack) s.rules.push({ id, on: false })
    return tidy(state, kind)
  }

  // revertRule puts a rule back to what the engine says it is: on for a
  // pack's rule, gone for the owner's
  function revertRule(state, kind, id) {
    const s = kindSpec(state, kind)
    s.rules = s.rules.filter((r) => !r || r.id !== id)
    return tidy(state, kind)
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
    put(state.injection, key, v, untouched)
    return tidy(state, "injection")
  }

  function setGuard(state, kind, key, v, untouched) {
    if (!state.guardrails || typeof state.guardrails !== "object") state.guardrails = {}
    put(state.guardrails, key, v, untouched)
    return tidy(state, "guardrails")
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
    return tidy(state, "guardrails")
  }

  // setKeeps writes the list, or takes the key out when the list is the
  // engine's own, so an update can change the default
  function setKeeps(state, kind, list, defaultList) {
    if (!state.guardrails || typeof state.guardrails !== "object") state.guardrails = {}
    const d = defaultList || []
    const same = list.length === d.length && list.every((w, i) => w === d[i])
    if (same) delete state.guardrails.keep
    else state.guardrails.keep = list
    return tidy(state, "guardrails")
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

  // ---------------------------------------------------------------------
  // the guardrail presets
  // ---------------------------------------------------------------------

  // presets are the sets the page can apply, each with the text it was taken
  // from (page/samples.js)
  function presets() {
    return Array.isArray(globalThis.PromptGuardPresets) ? globalThis.PromptGuardPresets : []
  }

  function presetOn(E, state, preset) {
    const now = packs(E, "guardrails", state)
    return preset.packs.every((id) => now.some((p) => p.id === id && p.on))
  }

  // ruleMatches is whether a rule's own pattern is anywhere in a text: a
  // rule that fires for nobody because a pack that runs first covered the
  // clause is not the same as a rule whose clause is gone from the prompt
  function ruleMatches(E, id, text) {
    const rule = E.rulesFor("guardrails", { packs: {} }).filter((r) => r.id === id)[0]
    if (!rule || !rule.pattern) return false
    const flags = [...new Set("im" + (rule.flags || ""))].filter((c) => "ims".includes(c)).join("")
    try {
      return new RegExp(rule.pattern, flags).test(text)
    } catch (err) {
      return false
    }
  }

  // presetRun works a preset's own rules over its own sample, whatever the
  // options say now: what the extract button reports
  function presetRun(E, preset) {
    const on = {}
    for (const id of preset.packs) on[id] = true
    const opts = { guardrails: { packs: on, keep: [...(E.DEFAULT_KEEP || []), ...(preset.keep || [])] } }
    const r = E.previewText(preset.sample, opts, "system")
    const hits = (r.hits || []).map((h) => ({ id: h.id, name: h.name || h.id, unit: h.unit || "", match: h.match }))
    const before = preset.sample.length
    const after = r.out.length
    const fired = hits.map((h) => h.id)
    return {
      hits,
      before,
      after,
      removed: before - after,
      percent: before ? (before - after) / before : 0,
      // only a rule whose clause is in no form of the captured prompt at all:
      // one that another pack covered first is not a problem to show the
      // reader, and a clause the lean form of the prompt does not carry is
      // still the rule's clause while the full one has it
      missed: preset.rules.filter((id) => fired.indexOf(id) < 0 && !formsOf(preset).some((f) => ruleMatches(E, id, f.sample))),
      out: r.out,
    }
  }

  // formsOf is the forms of the prompt a preset was extracted from: the ones
  // the capture carried, or the one excerpt a preset carried over from an
  // older capture has
  function formsOf(preset) {
    return Array.isArray(preset.variants) && preset.variants.length ? preset.variants : [{ id: preset.id, sample: preset.sample }]
  }

  // presetApply turns a preset on: its packs, the reading it was built for,
  // and the caution it protects — added to whatever the owner keeps, never in
  // place of it
  function presetApply(E, state, preset) {
    for (const id of preset.packs) setPack(state, "guardrails", id, true, packDefault(E, "guardrails", id))
    setGuard(state, "guardrails", "on", true, true)
    setGuard(state, "guardrails", "unit", "sentence", "sentence")
    setGuard(state, "guardrails", "sections", true, true)
    setGuardScope(state, "guardrails", "system", true)
    const mine = keepList(E, state)
    const extra = (preset.keep || []).filter((k) => mine.indexOf(k) < 0)
    if (extra.length) setKeeps(state, "guardrails", [...mine, ...extra], E.DEFAULT_KEEP)
    return state
  }

  // presetSummary is the one line the card shows: how many clauses the
  // preset takes out of its own excerpt, and how much of it
  function presetSummary(E, preset, t, lang) {
    const r = presetRun(E, preset)
    if (!r.hits.length) return t.presetNothing
    const zh = String(lang || "").toLowerCase().startsWith("zh")
    const n = (x) => Number(x).toLocaleString(zh ? "zh-CN" : "en-US")
    return `${n(r.hits.length)} ${t.presetHits} · ${n(r.removed)} ${t.presetChars} ${t.presetReport} (${Math.round(r.percent * 100)}% ${t.presetOfExcerpt})`
  }

  globalThis.PromptGuardView = {
    TEXT, SCOPE_ORDER, ACTION_ORDER, UNIT_ORDER, BENCH_ROLES,
    text, clone, compiles,
    rules, packs, packDefault, scopeActions, guardOn, guardUnit, guardSections, injectionSpec, enabled, keepList, keepsText,
    limits, traceOn, setTrace, setLimit, benchSize, benchRequest, MOEJS_MS_PER_KB,
    setScope, setPack, setRule, dropRule, revertRule, addRule, setEnabled,
    setInjection, setGuard, setGuardScope, setKeeps,
    presets, presetOn, presetRun, presetApply, presetSummary, formsOf,
    bench,
  }
})()
