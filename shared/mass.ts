import {createReadStream, createWriteStream} from "node:fs"
import {mkdir, open, lstat, rename, unlink} from "node:fs/promises"
import {pipeline} from "node:stream/promises"
import {dirname, join, resolve} from "node:path"

const key = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Runtime-only flat key-to-bytes catalog. It deliberately knows no Atom or Boundary relation. */
export class MassCatalog {
  constructor(readonly root = resolve(import.meta.dir, "..", "mass")) {}

  private file(id: string): string {
    if (!key.test(id)) throw new Error("Mass key is not a global key ID")
    return join(this.root, id)
  }

  private async ready(target: string): Promise<void> {
    await mkdir(this.root, {recursive: true})
    if ((await lstat(this.root)).isSymbolicLink() || dirname(target) !== this.root) throw new Error("Mass catalog path escaped root")
    try { if ((await lstat(target)).isSymbolicLink()) throw new Error("Mass catalog file cannot be a symlink") }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
  }

  async copy(from: string, to: string): Promise<void> {
    const source = this.file(from), target = this.file(to)
    await this.ready(source); await this.ready(target)
    const temporary = join(this.root, `.${to}.${crypto.randomUUID()}.tmp`)
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

  async cleanupSafe(id: string): Promise<void> {
    const target = this.file(id)
    await this.ready(target)
    await unlink(target).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    })
  }
}
