// Writes package.json's `magpie.icon` from page/icon.svg.
//
// magpie carries a plugin's own picture as package.json's `magpie.icon`, and
// it takes only an https URL or a data:image URI (internal/provider's iconOf,
// over 1 MB not carried) — never a path, so the page's icon file cannot be
// named there. Rather than keep two copies of the same picture in step by
// hand, this writes the one in the package from the one in the page: one
// source of truth, and prompt-guard.test.mjs fails while they differ.
//
//   bun run icon   (or node scripts/sync-icon.mjs)
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = import.meta.dir ?? dirname(fileURLToPath(import.meta.url))
const root = join(here, "..")
const iconPath = join(root, "page", "icon.svg")
const pkgPath = join(root, "package.json")

// dataURI is the icon as magpie wants it: the file's bytes, base64, with the
// media type it declares
export function dataURI() {
  const svg = readFileSync(iconPath, "utf8").trim()
  return `data:image/svg+xml;base64,${Buffer.from(svg + "\n", "utf8").toString("base64")}`
}

// The line the URI lives on, at magpie's own level: the page's icon is a path
// one level deeper, and is not this one. Written out rather than re-serialized
// so the hand-kept shape of package.json — one line per field, arrays on one
// line — survives a run of this.
const ICON_LINE = /^    "icon": "data:image\/[^"]*",?$/m
const MAGPIE_OPEN = /^  "magpie": \{$/m

// withIcon is package.json with that URI on magpie.icon
export function withIcon() {
  const raw = readFileSync(pkgPath, "utf8")
  const value = JSON.stringify(dataURI())
  if (ICON_LINE.test(raw)) return raw.replace(ICON_LINE, `    "icon": ${value},`)
  return raw.replace(MAGPIE_OPEN, `  "magpie": {\n    "icon": ${value},`)
}

const isMain = typeof Bun !== "undefined"
  ? import.meta.main
  : process.argv[1] === fileURLToPath(import.meta.url)

if (isMain) {
  writeFileSync(pkgPath, withIcon())
  console.log(`package.json written · magpie.icon is page/icon.svg (${readFileSync(iconPath, "utf8").trim().length} bytes of SVG)`)
}