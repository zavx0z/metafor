import {mkdir, open, readFile, lstat, rename, unlink} from "node:fs/promises"
import {dirname, join, resolve} from "node:path"
import type {EnergyMassArtifact} from "@metafor/types/energy/catalog"
import type {EnergyMassContext, EnergyMassStore} from "@metafor/types/energy/mass"
import {massFileName, type MassFileFormat} from "../shared/mass.ts"

const keyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const bytes = (value: string | Uint8Array): Uint8Array => typeof value === "string" ? new TextEncoder().encode(value) : value

export type EnergyMassHandle = {
  readonly keyId: string
  readonly format: "json" | "binary"
  readBytes(): Promise<Uint8Array>
  readText(): Promise<string>
  readJson<Value = unknown>(): Promise<Value>
  write(value: unknown): Promise<void>
}

export class EnergyMassGate {
  #generation = new Map<string, number>()
  #live = new Set<string>()
  #fenced = new Set<string>()

  private identity(atom: number, declaration: number, key: string): string {
    return `${atom}\0${declaration}\0${key}`
  }

  authorize(atom: number, declaration: number, key: string): number {
    const identity = this.identity(atom, declaration, key)
    const previous = this.#generation.get(identity)
    if (previous !== undefined) this.#live.delete(`${identity}\0${previous}`)
    const generation = (previous ?? 0) + 1
    this.#generation.set(identity, generation)
    this.#live.add(`${identity}\0${generation}`)
    return generation
  }
  revoke(atom: number, declaration: number, key: string, generation: number): void {
    this.#live.delete(`${this.identity(atom, declaration, key)}\0${generation}`)
  }
  fence(atom: number, declaration: number, key: string): void {
    this.#fenced.add(this.identity(atom, declaration, key))
  }
  release(atom: number, declaration: number, key: string): void {
    this.#fenced.delete(this.identity(atom, declaration, key))
  }
  assert(atom: number, declaration: number, key: string, generation: number): void {
    const identity = this.identity(atom, declaration, key)
    if (this.#fenced.has(identity) || !this.#live.has(`${identity}\0${generation}`)) {
      throw new Error("Energy Mass handle generation is not live")
    }
  }
}

/** Flat worktree-local file catalog. No caller-provided filesystem path exists. */
export class EnergyMassCatalog {
  readonly root: string

  constructor(root = process.env.METAFOR_MASS_PATH?.trim() || resolve(import.meta.dir, "..", "mass")) {
    this.root = resolve(root)
  }

  private path(keyId: string, format: MassFileFormat): string {
    if (!keyPattern.test(keyId)) throw new Error("Energy Mass key is not a Boundary-issued key ID")
    return join(this.root, massFileName(keyId, format))
  }

  private async ensureRoot(): Promise<void> {
    await mkdir(this.root, {recursive: true})
    const root = await lstat(this.root)
    if (root.isSymbolicLink() || !root.isDirectory()) throw new Error("Energy Mass catalog root is invalid")
  }

  private async verifyTarget(target: string): Promise<void> {
    if (dirname(target) !== this.root) throw new Error("Energy Mass catalog escaped its root")
    try {
      if ((await lstat(target)).isSymbolicLink()) throw new Error("Energy Mass key file cannot be a symlink")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
  }

  async read(keyId: string, format: MassFileFormat): Promise<Uint8Array> {
    await this.ensureRoot()
    const target = this.path(keyId, format)
    await this.verifyTarget(target)
    try { return new Uint8Array(await readFile(target)) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Uint8Array()
      throw error
    }
  }

  /** Same-directory temporary + fsync + rename leaves the prior target intact on failure. */
  async write(keyId: string, format: MassFileFormat, value: string | Uint8Array): Promise<void> {
    await this.ensureRoot()
    const target = this.path(keyId, format)
    await this.verifyTarget(target)
    const temporary = join(this.root, `.${massFileName(keyId, format)}.${crypto.randomUUID()}.tmp`)
    let handle: Awaited<ReturnType<typeof open>> | undefined
    try {
      handle = await open(temporary, "wx", 0o600)
      await handle.write(bytes(value))
      await handle.sync()
      await handle.close()
      handle = undefined
      await rename(temporary, target)
    } catch (error) {
      await handle?.close().catch(() => undefined)
      await unlink(temporary).catch(() => undefined)
      throw error
    }
  }

  async copy(from: string, to: string, format: MassFileFormat): Promise<void> {
    await this.write(to, format, await this.read(from, format))
  }

  handle(artifact: Pick<EnergyMassArtifact, "id" | "keyId" | "format">, guard?: {gate: EnergyMassGate; atom: number; generation: number}): EnergyMassHandle {
    const live = (): void => guard?.gate.assert(guard.atom, artifact.id, artifact.keyId, guard.generation)
    return {
      keyId: artifact.keyId,
      format: artifact.format,
      readBytes: async () => { live(); return await this.read(artifact.keyId, artifact.format) },
      readText: async () => {
        live()
        return new TextDecoder().decode(await this.read(artifact.keyId, artifact.format))
      },
      readJson: async <Value>() => {
        live()
        return JSON.parse(new TextDecoder().decode(await this.read(artifact.keyId, artifact.format))) as Value
      },
      write: async (value) => {
        live()
        if (artifact.format === "json") await this.write(artifact.keyId, artifact.format, JSON.stringify(value))
        else if (value instanceof Uint8Array) await this.write(artifact.keyId, artifact.format, value)
        else throw new Error("Binary Mass accepts Uint8Array only")
      },
    }
  }
}

/** Energy-local handle projection. It contains no membership or source registry. */
export const createFilesystemEnergyMassStore = (gate = new EnergyMassGate()): EnergyMassStore => {
  const catalog = new EnergyMassCatalog()
  const values = new Map<string, Record<string, unknown>>()
  const keyOf = (ctx: EnergyMassContext): string => `${ctx.wimp}\0${ctx.atomId}`
  return {
    get(ctx) {
      const key = keyOf(ctx)
      let value = values.get(key)
      if (!value) {
        value = {}
        values.set(key, value)
      }
      return value
    },
    bind(ctx, value) { values.set(keyOf(ctx), value) },
    authorize(ctx, artifacts) {
      values.set(keyOf(ctx), Object.fromEntries(artifacts.map((artifact) => [artifact.key, catalog.handle(artifact, {
        gate, atom: ctx.atomId, generation: gate.authorize(ctx.atomId, artifact.id, artifact.keyId),
      })])))
    },
    clear() { values.clear() },
  }
}
