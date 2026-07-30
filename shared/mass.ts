import {createReadStream, createWriteStream} from "node:fs"
import {mkdir, open, lstat, rename, unlink} from "node:fs/promises"
import {pipeline} from "node:stream/promises"
import {dirname, join, resolve} from "node:path"

const key = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type MassFileFormat = "json" | "binary"

export const massExtension = (format: MassFileFormat): "json" | "bin" =>
  format === "json" ? "json" : "bin"

export const massFileName = (id: string, format: MassFileFormat): string => {
  if (!key.test(id)) throw new Error("Mass key is not a global key ID")
  return `${id}.${massExtension(format)}`
}

/** Runtime-only flat key-to-bytes catalog. It deliberately knows no Atom or Boundary relation. */
export class MassCatalog {
  constructor(readonly root = resolve(
    process.env.METAFOR_MASS_PATH?.trim() || resolve(import.meta.dir, "..", "mass"),
  )) {}

  private file(id: string, format: MassFileFormat): string {
    return join(this.root, massFileName(id, format))
  }

  private legacyFile(id: string): string {
    if (!key.test(id)) throw new Error("Mass key is not a global key ID")
    return join(this.root, id)
  }

  private async ready(target: string): Promise<void> {
    await mkdir(this.root, {recursive: true})
    if ((await lstat(this.root)).isSymbolicLink() || dirname(target) !== this.root) throw new Error("Mass catalog path escaped root")
    try { if ((await lstat(target)).isSymbolicLink()) throw new Error("Mass catalog file cannot be a symlink") }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
  }

  async copy(from: string, to: string, format: MassFileFormat): Promise<void> {
    const source = this.file(from, format), target = this.file(to, format)
    await this.ready(source); await this.ready(target)
    const temporary = join(this.root, `.${massFileName(to, format)}.${crypto.randomUUID()}.tmp`)
    try {
      await pipeline(createReadStream(source), createWriteStream(temporary, {flags: "wx", mode: 0o600}))
      const handle = await open(temporary, "r")
      await handle.sync(); await handle.close()
      await rename(temporary, target)
    } catch (error) {
      await unlink(temporary).catch(() => undefined)
      throw error
    }
  }

  async cleanupSafe(id: string, format: MassFileFormat): Promise<void> {
    const target = this.file(id, format)
    await this.ready(target)
    await unlink(target).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    })
  }

  /** Renames one pre-extension key file without overwriting either copy. */
  async migrateLegacy(id: string, format: MassFileFormat): Promise<boolean> {
    const legacy = this.legacyFile(id)
    const target = this.file(id, format)
    await this.ready(target)
    let legacyStat
    try {
      legacyStat = await lstat(legacy)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
      throw error
    }
    if (legacyStat.isSymbolicLink() || !legacyStat.isFile()) throw new Error("Legacy Mass key file is invalid")
    try {
      await lstat(target)
      throw new Error("Legacy and extension-bearing Mass files both exist")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
    await rename(legacy, target)
    return true
  }
}
