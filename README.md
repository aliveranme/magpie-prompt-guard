# magpie-prompt-guard

Filters the prompts [magpie](https://usemagpie.ai)'s gateway sends, on two axes:

1. **Injection** — phrases that try to take a conversation over (`ignore all
   previous instructions`, a forged `<|im_start|>system` marker, `reveal your
   system prompt`, a pasted `system:` line, `忽略以上所有指令`) are replaced,
   logged, or turned away with an error, before the request is routed.
2. **Guardrails** — the safety boilerplate an agent puts in its own system
   prompt, the paragraphs that make a model refuse work that is fine (`you
   must refuse`, `safety guidelines`, `consult your security team`), are taken
   out of that prompt before it is sent.

Both are driven by rules you can add, edit and switch off. Rules ship in
**packs**, so the plugin filters the moment it is switched on, and a rule of
yours is added on top — or replaces a pack's rule by its id.

It is one package that is both a **gateway middleware** and a **page in
magpie's window**: the page edits the same options the gateway runs on, its
test bench shows what the rules would do to a text you paste in, and its
**guardrail presets** are extracted from the system prompts Claude Code and
Claude Desktop really send — with the rules held to that text, and a button
that shows, on a verbatim excerpt, exactly what comes out.

```sh
magpie plugin add ./magpie-prompt-guard      # or a published name
magpie plugin                                # it is listed as a middleware and a page
```

Then open it under **Plugins › Installed**, turn it on, and switch
**Gateway middleware** and its page on under **Plugins › Built-in**. Its page
is in the sidebar's Plugins group.

## How it plugs in

| Where | What it uses |
|---|---|
| The request | `magpie.middleware` → `prompt-guard.middleware.js`, one `onRequest(body, ctx)` hook on every request an agent sends, in the agent's own API: Anthropic Messages, OpenAI Chat Completions, OpenAI Responses and Gemini. `ctx.protocol`, `ctx.agent`, `ctx.model` and `ctx.options` come with it. |
| The window | `magpie.page` → `page/index.html`, a sandboxed frame that talks to the window only through `_magpie/bridge.js`: `magpie.ready`, `magpie.options.get/set`, `magpie.theme`/`onTheme`. |
| The settings | The plugin's own `options` in `plugins.json`. The page writes them; magpie takes a save at most once a second and the gateway picks the change up within about a second, with no restart. |
| The words | The page is translated by itself from `magpie.theme.lang` (English and 简体中文). |
| The presets | Each one is the guardrail-bearing text of the agent's own prompt, captured from this machine by `scripts/extract-guardrails.mjs` and built into `page/samples.js` by `scripts/make-samples.mjs`. |

Nothing else of magpie is touched, and the page asks for no reads
(`magpie.permissions` is empty) — it can see its own options and nothing
else. Its frame has `connect-src 'none'`, so no text ever leaves it: the test
bench runs on a copy of the gateway's engine inside the page.

## The options

Everything is optional. With no options at all the packs below run with the
defaults, so a plugin that was just switched on already filters; what you
change is written to `plugins.json` and nothing else, so a rule magpie adds
later arrives with an update rather than being frozen into your file.

```jsonc
{
  "enabled": true,
  "log": "reject",              // off | reject | all — what reaches magpie's log
  "agents": [],                 // when named, only these agents
  "models": [],                 // when named, only models with one of these prefixes

  "injection": {
    "packs": { "classic": true, "spoof": true, "jailbreak": true },
    "scopes": {                 // what each kind of turn is read for
      "user": "neutralize",     // off | flag | neutralize | reject
      "tool": "neutralize",
      "system": "off",
      "assistant": "off"
    },
    "mask": "[filtered]",       // what a match is replaced by; "" deletes it
    "status": 400,              // the status a rejection is given
    "message": "",              // its text; empty uses the rule's name
    "rules": [                  // your rules, beside the packs'
      { "id": "codename", "name": "Project codename",
        "pattern": "\\bRaven\\b", "action": "reject" }
    ]
  },

  "guardrails": {
    "on": true,
    "unit": "sentence",         // sentence | line | block — how much a rule takes
    "sections": true,           // a matched heading takes its whole section
    "packs": { "refusal": true, "policy": true, "harm": true,
               "meta": true, "restrictions": false },
    "scopes": { "system": true },   // which texts are read
    "keep": ["api key", "password", "credential", "secret", "private key"],
    "rules": [                  // your rules; `unit` may be set per rule
      { "id": "house", "name": "Our AUP paragraph",
        "pattern": "our Acceptable Use Policy", "unit": "line" }
    ]
  }
}
```

Written by hand it goes in `plugins.json`; from a terminal it is
`magpie plugin options prompt-guard '<json>'`. **Plugins › Installed →
Options** edits the same JSON, and the plugin's page edits it as a form.

### What the page writes

Only the diff. A pack turned off is one `false`; a rule turned off is its id
and `on: false`, so the pattern that fires is still the one in the engine, and
fixing a rule is an update away. A scope, a unit or the mask is written only
when it differs from the default. The **Options as JSON** box at the foot of
the page always shows exactly what is in the file.

## The rules

A rule is an id, a name, a regular expression, and either an action
(injection) or a unit (guardrails). Every rule is compiled on its own: **a
pattern that will not compile is left out rather than thrown**, so a typo
cannot stop the gateway, and cannot turn every request away either. The page
marks such a rule in red as you write it.

| Field | On | Meaning |
|---|---|---|
| `id` | both | Names the rule. One of yours with a pack rule's id **is** that rule: give the same id and only the fields you want changed. |
| `on` | both | `false` switches the rule off without losing the rest of it. |
| `pattern` | both | The regular expression. Case-insensitive unless `flags` says otherwise. |
| `flags` | both | `i`, `m` — `g` is always added. `m` is what makes `^` and `$` mean a line rather than the text. |
| `name` | both | What the log, the report and the page call it. |
| `action` | injection | `off`, `flag`, `neutralize` or `reject`, overriding the scope's own action for this rule. |
| `scopes` | injection | The only scopes this rule applies to, e.g. `["user"]`. |
| `unit` | guardrails | `sentence`, `line` or `block`, overriding the guardrails' own unit for this rule. |

**Patterns are matched with magpie's JavaScript engine** (moejs), so what
works in a browser works here. Keep to `\b`, `\d`, `\s`, character classes,
groups and alternation where you can; a pattern that backtracks forever is
cut short by the hook's time limit, and the request then goes as it came.

### What each kind of turn is read for

`injection.scopes` maps the four kinds of text to an action:

| Scope | What it is | Default |
|---|---|---|
| `user` | Every user turn, in every content shape its API carries | `neutralize` |
| `tool` | Tool results: an Anthropic `tool_result`, a Chat `tool` turn, a Responses `function_call_output`, a Gemini `functionResponse` | `neutralize` |
| `system` | The agent's own system prompt — a top-level `system` (Anthropic), a `system`/`developer` message, `instructions` (Responses), `systemInstruction` (Gemini) | `off` |
| `assistant` | Turns the model already gave | `off` |

Tool **arguments** and tool descriptions are never read, images are never
read, and a Gemini `thought` part is never read.

The four actions are `off` (not read at all), `flag` (reported, changed
nothing), `neutralize` (the match becomes `mask`) and `reject` (the request
is turned away with `status` and `message`). A rejection wins over a
neutralization of the same text, since that request is going anyway.

### How much a guardrail rule takes

A guardrail rule **marks a clause**; the unit decides how much of it comes
out:

- `sentence` — the sentence the rule matched, and nothing else.
- `line` — the whole line it matched, for a bulleted or headed prompt.
- `block` — the whole paragraph, for a line that is a heading of its own.

With `sections` on (the default) a **heading** a `block` rule matched takes
every paragraph under it up to the next Markdown heading with it, which is how
a whole `# Safety and Security` section goes at once. What a `keep`
expression matches is never removed, and `keep` is checked at the unit's own
size: holding on to `api key` keeps the sentence about it, not the paragraph.

## The built-in packs

### Injection

| Pack | Default | Rules | Ids |
|---|---|---|---|
| `classic` | on | 7 | `ig-override`, `ig-newrules`, `ig-exfil`, `ig-repeat-above`, `ig-decode`, `ig-override-cn`, `ig-exfil-cn` |
| `spoof` | on | 4 | `ig-fake-system`, `ig-role-marker`, `ig-delimiter`, `ig-role-marker-cn` |
| `jailbreak` | on | 8 | `ig-jailbreak`, `ig-norestrict`, `ig-pretend`, `ig-safetyoff`, `ig-unrestricted`, `ig-youarenow`, `ig-jailbreak-cn`, `ig-norestrict-cn` |

### Guardrails

| Pack | Default | Rules | Ids |
|---|---|---|---|
| `refusal` | on | 6 | `gr-refuse`, `gr-cannot`, `gr-consult`, `gr-seekhelp`, `gr-refuse-cn`, `gr-consult-cn` |
| `policy` | on | 9 | `gr-safety`, `gr-legal`, `gr-categories`, `gr-safeai`, `gr-priority`, `gr-heading-safety`, `gr-label-safety`, `gr-heading-safety-cn`, `gr-safety-cn` |
| `harm` | on | 3 | `gr-harm`, `gr-harmtopics`, `gr-harm-cn` |
| `meta` | on | 4 | `gr-antiinject`, `gr-untrusted`, `gr-injectionnotice`, `gr-notinstructions` |
| `claude-code` | **off** | 7 | `cc-authorized-testing`, `cc-refuse-destructive`, `cc-dual-use`, `cc-injection-flag`, `cc-actions-with-care`, `cc-confirm-first`, `cc-risky-actions` |
| `claude-desktop` | **off** | 6 | `ccd-authorized-testing`, `ccd-refuse-destructive`, `ccd-dual-use`, `ccd-confirm-first`, `ccd-publish`, `ccd-inspect-first` |
| `restrictions` | **off** | 3 | `gr-mustnot`, `gr-notallowed`, `gr-neverdo` |

`restrictions` is the hammer: it takes out every "you must not", including the
guidance that has nothing to do with refusing a request. It is off until you
ask for it.

What `keep` protects by default is
`["api key", "password", "private key", "secret key"]` — phrases, not bare
words, because `credential` alone also matches "credential testing", and
protecting that would hold on to the very clause about authorized security
testing this plugin exists to take out.

English and 简体中文 rule ids are separate on purpose: the agents' own system
prompts are written in English, a message that reaches you can be in either,
and you may want one pack off and the other on.

## The guardrail presets

The last two packs are not guesses about how an agent's prompt reads: they
are held to the prompt it actually sends. **Plugins → Prompt guard →
Guardrail presets** has a card for each one:

- **Extract** unfolds the clauses it takes out — the rule, and the words it
  matched in the real text — and the text that would be left.
- **Open in the bench** loads that same excerpt into the test bench, where
  the rest of the settings can be tried against it.
- **Apply** writes the pack on, with the reading it was built for (one
  sentence at a time, whole sections for a matched heading).

Each card also says how much of its own excerpt it removes. That share is of
the *excerpt* — the guardrail-bearing part of a prompt and not all of it —
which is why it reads high; on the whole captured prompt it is around 15%.

### Where the text comes from

Nothing here is quoted from a blog post. `scripts/extract-guardrails.mjs`
points the agent at a stand-in for the vendor's API on loopback and keeps the
body it posts:

```sh
node scripts/extract-guardrails.mjs          # capture every target found
node scripts/extract-guardrails.mjs --check  # hold the packs to the capture
```

It writes `reference/<target>.system.txt` and `reference/<target>.json` (the
version and entrypoint it read out of the prompt's own header), and then
writes `page/samples.js` from that. **`reference/` is not committed** — it is
somebody else's prompt text, read on your machine — while the excerpts the
page shows and the patterns derived from them are.

`--check` is the regression check to run after an agent updates: it reports
what each preset removes, and fails when a rule's pattern no longer matches
the capture, which means the prompt was rewritten and the rule needs reading
again. A rule that matches but never fires is reported separately — that is
not a failure, it means one of the generic packs covered the clause first.

| Preset | Target | Captured | What it takes out |
|---|---|---|---|
| `claude-code` | Claude Code 2.1.301, the interactive CLI | 2026-10-16 | The `IMPORTANT:` block that says to refuse destructive techniques and to demand clear authorization before dual-use security work, the "flag it to the user" line about injected tool results, and the whole `# Executing actions with care` section |
| `claude-desktop` | Claude Desktop 2.37337.1.0, the Claude Code engine 2.1.295 it ships | 2026-10-16 | The same `IMPORTANT:` block, plus the harness's "confirm first unless durably authorized", "sending content to an external service publishes it" and "before deleting or overwriting, look at the target" |

Both leave alone what is good practice rather than a fence: the OWASP bullet,
"prefer editing existing files", "only use emojis if asked", and the
instruction to report a failed test faithfully all stay.

## What it is not

- **Not a safety classifier.** Matching is literal and by expression. It does
  not read what a request means, and a synonym, a paraphrase, a misspelling or
  a phrase split by formatting passes it. It is a way to keep listed text, and
  listed shapes of text, away from a model — not a guardrail that stops a
  determined prompt by itself.
- **Fail-open.** A hook that throws takes longer than its 250 ms, or returns
  something that is not an object, leaves the request exactly as it came and
  is counted as a failure. This plugin can never be the reason a request does
  not go.
- **Removing guardrails changes what the model does.** Taking the refusal
  boilerplate out of a system prompt does make a model refuse less; it also
  takes away instructions you may have wanted. Read the rules, run the test
  bench over a real system prompt, and use `keep` to hold on to the lines you
  want. Nothing here is needed for magpie's own privacy masking, which is the
  separate built-in plugin `redact`.
- **A guardrail rule that empties a whole message leaves it empty.** A system
  prompt that is entirely removed becomes `""` (and an emptied block in a list
  is taken out of the list). Every API magpie serves accepts an empty system
  prompt; if you would rather keep a line, put it in `keep`.

### With the community's own middleware

| Package | What it does differently |
|---|---|
| [`block-patterns`](https://github.com/magpie-community/plugins/tree/main/packages/block-patterns) | Turns a request away and nothing else; reads every user turn and every system prompt, and never rewrites. |
| [`word-guard`](https://github.com/magpie-community/plugins/tree/main/packages/word-guard) | Masks words in what is sent **and** in what comes back. |
| [`system-prompt`](https://github.com/magpie-community/plugins/tree/main/packages/system-prompt) | Puts a system prompt of yours on a request. |
| **this** | Rewrites what it matched (replace, delete or refuse), works on the agent's *own* system prompt to take safety boilerplate out, has a rule editor and a test bench, and reports on `ctx.state`. |

They can be installed together.

## The report

Alongside changing the request, the hook leaves what it found on
`ctx.state.promptGuard`:

```js
{ injection: [{ id, name, pack, action, match, role }],
  guardrails: [{ id, name, pack, unit, match, role }] }
```

And one line reaches magpie's log for a rejection (`"log": "reject"`, the
default), for nothing (`"off"`), or for every rule that fires (`"all"`):

```
prompt-guard [claude]: injection ignore previous instructions in user ("ignore all previous instructions")
```

## Working on it

```sh
bun test                          # 108 cases and the editor's own, on both engines
bun run build                     # regenerate page/engine.js and page/samples.js
bun run extract                   # capture the agents' prompts into reference/
bun run check                     # hold the packs to what was captured
npm run smoke                     # drive the page in a real browser
```

`page/engine.js` is **generated** — it is `prompt-guard.middleware.js` with
its `export` keywords taken off and its entry points put on
`globalThis.PromptGuard`, so a page sandboxed away from the gateway works the
same rules. The test suite runs `cases.json` through both and fails while the
two disagree, and fails while the generated file is not what the generator
would write.

```
prompt-guard.middleware.js   the engine: the hook, the rule book, the four
                             APIs' text walkers, the guardrail removal
cases.json                   what each rule does, and what comes out
prompt-guard.test.mjs        the cases, on both engines; the editor's own
page/engine.js               generated — do not edit
page/samples.js              generated — the presets' excerpts
page/view.js                 the editor's logic, without the DOM
page/app.js                  the editor: magpie's switch, strip and menu
page/index.html  style.css   the page, drawn from the theme's tokens
page/icon.svg                the tab's picture
scripts/middleware.mjs       runs a case the way the gateway calls it
scripts/sync-engine.mjs      writes page/engine.js
scripts/extract-guardrails.mjs  captures a prompt from the agent itself
scripts/make-samples.mjs     writes page/samples.js from the capture
scripts/page-smoke.mjs       a developer's check in a real browser
reference/                   the captures — not committed
```

## 中文

**magpie-prompt-guard** 过滤 magpie 网关发出的提示词，两条线：

1. **注入拦截** —— 试图接管对话的句式（`ignore all previous instructions`、
   伪造的 `<|im_start|>system` 标记、`reveal your system prompt`、粘贴的
   `system:` 一行、`忽略以上所有指令`）在请求路由之前被替换、记录或以错误拒绝。
2. **安全围栏剔除** —— agent 写进自己系统提示词里的安全套话（`you must refuse`、
   `safety guidelines`、`consult your security team`）在发出之前从提示词里删掉：
   正是这类文字让模型对本来没问题的活儿频繁拒答。

规则可增可改可关。规则以**规则包**形式内置，插件一打开就生效；你自己写的规则叠加在
其上，同 id 即覆盖内置规则。

**它同时是网关中间件和 magpie 窗口里的一页**：页面编辑的就是网关执行的那份 options，
页面里的「试验台」让你直接粘贴一段文本，看规则会把它改成什么样；「围栏预设」页则是从
Claude Code 与 Claude Desktop **真实发出的**系统提示词里提取出来的。「提取」按钮会把
命中的原句和剔除后的结果直接摊开给你看。

```sh
magpie plugin add ./magpie-prompt-guard
```

然后在 **Plugins › Installed** 里打开它，并在 **Plugins › Built-in** 里打开
“JS gateway plugins”（中间件）与它自己的页面；页面在侧边栏 Plugins 分组下。

### 关键行为

- **所有选项都可选。** 一个选项都不写，内置规则包按默认值运行；你改的才写进
  `plugins.json`，其余留空 —— 这样 magpie 以后新增的规则会随更新一起到来。
- **作用范围**：`user`（用户消息）、`tool`（工具结果，间接注入的主要入口）、
  `system`（agent 自己的系统提示词）、`assistant`（模型已发出的回复）。
  四种动作：`off` 不读、`flag` 只记日志、`neutralize` 替换、`reject` 拒绝请求。
- **剔除单元**：`sentence` 整句 / `line` 整行 / `block` 整段。规则只负责“标记”，
  删多少由单元决定。勾选「命中的标题连同整节」时，标题命中即连同其下所有段落一起删除
  （`# Safety and Security` 整节消失就是靠这个）。
- **`keep` 永不剔除**：默认保护 `api key`、`password`、`credential`、`secret`、
  `private key` —— 值得留下的恰恰是这些“不要泄露凭据”。判断按单元粒度进行：
  保护 `api key` 只保住那一句，不会连整段一起保住。
- **`restrictions` 包默认关闭**：它会删掉所有 “you must not” 句式，包括与拒答无关的
  正常指引，属于重锤，要用再开。
- **`claude-code` / `claude-desktop` 包默认也关闭**：它们删除的是特定 agent 系统提示词里的
  授权与拒答条款，是否取用由你决定。在「围栏预设」页一键应用即可。
- **`keep` 默认只保护词组而非单词**：`api key`、`password`、`private key`、`secret key`。
  因为单独的 `credential` 会命中 “credential testing”，一保护就把最该删的那句 dual-use
  授权条款也保住了。
- **正则编译失败不会抛错**：坏 pattern 被忽略，既不会拖垮网关，也不会把所有请求拒掉；
  页面里会标红提示。
- **失败即放行（fail open）**：钩子抛异常、超 250 ms 或返回非对象时，请求原样发出。
  本插件永远不会成为请求发不出去的原因。
- **它不是安全分类器**：是字面与正则匹配，近义词、改写、拼写变体、被格式拆开的词都能
  绕过。它的用途是把点名的文本和点名的句式挡在模型之外，而不是单独拦住处心积虑的提示词。
- **剔除围栏会改变模型行为**：这就是它的目的，但也可能删掉你想保留的指令。
  建议先用试验台跑一遍真实的系统提示词，该保的写进 `keep`。

### 关于两个 Claude 预设的出处

不是从博客抄的：`scripts/extract-guardrails.mjs` 在本地起一个假上游，让 agent 把请求发给它，
把它真正 POST 出去的 body 留下来：

```sh
node scripts/extract-guardrails.mjs          # 抓取本机能找到的每个目标
node scripts/extract-guardrails.mjs --check  # 用抓取结果校验规则包
```

结果写到 `reference/`（**不入库**——那是别人的提示词文本），再由
`scripts/make-samples.mjs` 生成入库的 `page/samples.js`。agent 升级后重跑 `--check`：
某条规则的模式不再匹配，就说明提示词被改写了，该重新读一遍。

| 预设 | 目标 | 抓取日期 | 剔除内容 |
|---|---|---|---|
| `claude-code` | Claude Code 2.1.301（交互 CLI） | 2026-10-16 | 声明「拒绝破坏性技术」并要求双用途安全工作必须有明确授权的那段 `IMPORTANT:`；工具结果疑似注入时「先向用户报告」那条；整个 `# Executing actions with care` 小节 |
| `claude-desktop` | Claude Desktop 2.37337.1.0 自带的 Claude Code 引擎 2.1.295 | 2026-10-16 | 同一段 `IMPORTANT:`，加上 harness 自己的「不可逆或对外动作先确认」「发往外部服务即等于公开」「删改前先看清楚目标」 |

两者都保留「是良好实践而不是围栏」的内容：OWASP 那条、「优先改现有文件」、「只在明确要求时用 emoji」、
以及「测试失败就如实报告」。

### 测试与开发

```sh
bun test                    # 108 条用例 + 编辑器逻辑，双引擎各跑一遍
bun run build               # 重新生成 page/engine.js 与 page/samples.js
bun run extract             # 抓取 agent 的真实系统提示词到 reference/
bun run check               # 用抓取结果校验规则包
npm run smoke               # 真实浏览器里驱动页面
```

`page/engine.js` 是**生成文件**：把中间件的 `export` 去掉、入口挂到
`globalThis.PromptGuard`，让沙箱页面能跑同一套规则。测试会同时跑两个引擎并比对结果，
生成文件与生成器不一致时测试直接失败。

## License

MIT
