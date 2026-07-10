import {mkdir, readFile, rename, writeFile} from "node:fs/promises"
import {dirname, join} from "node:path"

export type DeclarationEntity = {
  path: string
  section: string
  value: unknown
}

export type WimpProjection = {
  entities: DeclarationEntity[]
  children: string[]
}

type PersistedProjection = {
  version: 1
  roots: string[]
  wimps: Array<[string, WimpProjection]>
}

const DEFAULT_PATH = join(import.meta.dir, "tmp", "projection.json")

/** Stable positive 52-bit local declaration identity. */
export const stableLocalId = (scope: string, semanticKey: string): string => {
  let hash = 0xcbf29ce484222325n
  const source = `${scope}\0${semanticKey}`
  for (const codeUnit of source) {
    hash ^= BigInt(codeUnit.charCodeAt(0))
    hash = BigInt.asUintN(64, hash * 0x100000001b3n)
  }
  return String(Number(hash & 0xfffffffffffffn) || 1)
}

const cloneProjection = (projection: WimpProjection): WimpProjection => structuredClone(projection)

export class DarkProjectionStore {
  readonly projection = new Map<string, WimpProjection>()
  readonly roots = new Set<string>()
  readonly filename: string | null

  constructor(filename = process.env.DARK_PROJECTION_PATH?.trim()) {
    this.filename = filename === ":memory:" ? null : filename || DEFAULT_PATH
  }

  async load(): Promise<void> {
    if (!this.filename) return
    let parsed: PersistedProjection
    try {
      parsed = JSON.parse(await readFile(this.filename, "utf8")) as PersistedProjection
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return
      throw error
    }
    if (parsed.version !== 1 || !Array.isArray(parsed.roots) || !Array.isArray(parsed.wimps)) {
      throw new Error(`Unsupported Dark projection store: ${this.filename}`)
    }
    this.projection.clear()
    this.roots.clear()
    for (const root of parsed.roots) if (typeof root === "string" && root.length > 0) this.roots.add(root)
    for (const entry of parsed.wimps) {
      if (!Array.isArray(entry) || typeof entry[0] !== "string") continue
      const value = entry[1]
      if (!value || !Array.isArray(value.entities) || !Array.isArray(value.children)) continue
      this.projection.set(entry[0], cloneProjection(value))
    }
  }

  async save(): Promise<void> {
    if (!this.filename) return
    const payload: PersistedProjection = {
      version: 1,
      roots: [...this.roots],
      wimps: [...this.projection].map(([src, value]) => [src, cloneProjection(value)]),
    }
    await mkdir(dirname(this.filename), {recursive: true})
    const temporary = `${this.filename}.${process.pid}.${crypto.randomUUID()}.tmp`
    await writeFile(temporary, `${JSON.stringify(payload)}\n`, "utf8")
    await rename(temporary, this.filename)
  }
}
