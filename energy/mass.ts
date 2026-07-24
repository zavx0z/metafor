import {mkdir, open, readFile, lstat, rename, unlink} from "node:fs/promises"
import {dirname, join, resolve} from "node:path"
import type {EnergyMassArtifact} from "@metafor/types/energy/catalog"
import type {EnergyMassContext, EnergyMassStore} from "@metafor/types/energy/mass"

const keyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const bytes = (value: string | Uint8Array): Uint8Array => typeof value === "string" ? new TextEncoder().encode(value) : value

export type EnergyMassHandle = {
  readonly keyId: string
  readonly format: "json" | "binary"
  readonly mime: string
  readBytes(): Promise<Uint8Array>
  readText(): Promise<string>
  readJson<Value = unknown>(): Promise<Value>
  write(value: unknown): Promise<void>
}

/** Flat worktree-local file catalog. No caller-provided filesystem path exists. */
export class EnergyMassCatalog {
  readonly root = resolve(import.meta.dir, "..", "mass")

  private path(keyId: string): string {
    if (!keyPattern.test(keyId)) throw new Error("Energy Mass key is not a Boundary-issued key ID")
    return join(this.root, keyId)
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

  async read(keyId: string): Promise<Uint8Array> {
    await this.ensureRoot()
    const target = this.path(keyId)
    await this.verifyTarget(target)
    try { return new Uint8Array(await readFile(target)) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Uint8Array()
      throw error
    }
  }

  /** Same-directory temporary + fsync + rename leaves the prior target intact on failure. */
  async write(keyId: string, value: string | Uint8Array): Promise<void> {
    await this.ensureRoot()
    const target = this.path(keyId)
    await this.verifyTarget(target)
    const temporary = join(this.root, `.${keyId}.${crypto.randomUUID()}.tmp`)
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

  async copy(from: string, to: string): Promise<void> {
    await this.write(to, await this.read(from))
  }

  handle(artifact: Pick<EnergyMassArtifact, "keyId" | "format" | "mime">): EnergyMassHandle {
    return {
      keyId: artifact.keyId,
      format: artifact.format,
      mime: artifact.mime,
      readBytes: () => this.read(artifact.keyId),
      readText: async () => new TextDecoder().decode(await this.read(artifact.keyId)),
      readJson: async <Value>() => JSON.parse(new TextDecoder().decode(await this.read(artifact.keyId))) as Value,
      write: async (value) => {
        if (artifact.format === "json") await this.write(artifact.keyId, JSON.stringify(value))
        else if (value instanceof Uint8Array) await this.write(artifact.keyId, value)
        else throw new Error("Binary Mass accepts Uint8Array only")
      },
    }
  }
}

/** Energy-local handle projection. It contains no membership or source registry. */
export const createFilesystemEnergyMassStore = (): EnergyMassStore => {
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
      values.set(keyOf(ctx), Object.fromEntries(artifacts.map((artifact) => [artifact.key, catalog.handle(artifact)])))
    },
    clear() { values.clear() },
  }
}
