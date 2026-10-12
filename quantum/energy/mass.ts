import {mkdir, open, readFile, lstat, rename, unlink} from "node:fs/promises"
import {dirname, join, resolve} from "node:path"
import type {MassDirectoryHandle, MassDirectoryLease} from "@metafor/types/metafor/mass"
import type {EnergyMassArtifact} from "@energy/types/catalog"
import type {EnergyMassContext, EnergyMassStore} from "@energy/types/mass"
import {massFileName, type MassFileFormat} from "../../shared/mass.ts"

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
  #signals = new Map<string, Set<AbortController>>()
  #retargeted = new Map<string, {
    entryId: string
    generation: number
    pendingAuthorization: boolean
  }>()

  private identity(atom: number, declaration: number, key: string): string {
    return `${atom}\0${declaration}\0${key}`
  }

  authorize(atom: number, declaration: number, key: string): number {
    const identity = this.identity(atom, declaration, key)
    const retargeted = this.#retargeted.get(identity)
    if (retargeted?.pendingAuthorization === true) {
      retargeted.pendingAuthorization = false
      return retargeted.generation
    }
    const previous = this.#generation.get(identity)
    if (previous !== undefined) this.retire(identity, previous)
    const generation = (previous ?? 0) + 1
    this.#generation.set(identity, generation)
    this.#live.add(`${identity}\0${generation}`)
    return generation
  }
  revoke(atom: number, declaration: number, key: string, generation: number): void {
    this.retire(this.identity(atom, declaration, key), generation)
  }
  private retire(identity: string, generation: number): void {
    const key = `${identity}\0${generation}`
    this.#live.delete(key)
    for (const controller of this.#signals.get(key) ?? []) controller.abort(new Error("Directory Mass lease generation retired"))
    this.#signals.delete(key)
  }
  watch(atom: number, declaration: number, key: string, generation: number, controller: AbortController): () => void {
    this.assert(atom, declaration, key, generation)
    const identity = `${this.identity(atom, declaration, key)}\0${generation}`
    const controllers = this.#signals.get(identity) ?? new Set<AbortController>()
    controllers.add(controller)
    this.#signals.set(identity, controllers)
    return () => {
      controllers.delete(controller)
      if (!controllers.size) this.#signals.delete(identity)
    }
  }
  fence(atom: number, declaration: number, key: string): void {
    this.#fenced.add(this.identity(atom, declaration, key))
  }
  release(atom: number, declaration: number, key: string): void {
    this.#fenced.delete(this.identity(atom, declaration, key))
  }
  generation(atom: number, declaration: number, key: string): number {
    const identity = this.identity(atom, declaration, key)
    const generation = this.#generation.get(identity)
    if (generation === undefined || !this.#live.has(`${identity}\0${generation}`)) {
      throw new Error("Energy Mass handle generation is not live")
    }
    return generation
  }
  fenced(atom: number, declaration: number, key: string): boolean {
    return this.#fenced.has(this.identity(atom, declaration, key))
  }
  /**
   * Creates the target identity for an exact fenced source without copying
   * bytes or releasing the source fence.
   */
  retarget(
    source: {atom: number; declaration: number; key: string; generation: number},
    target: {atom: number; declaration: number; key: string},
    entryId: string,
  ): number {
    const sourceIdentity = this.identity(source.atom, source.declaration, source.key)
    if (
      !this.#fenced.has(sourceIdentity) ||
      this.generation(source.atom, source.declaration, source.key) !== source.generation ||
      source.key !== target.key
    ) {
      throw new Error("Energy Mass retarget source is not the exact fenced generation")
    }
    const targetIdentity = this.identity(target.atom, target.declaration, target.key)
    const previous = this.#retargeted.get(targetIdentity)
    if (previous) {
      if (previous.entryId !== entryId) {
        throw new Error("Energy Mass target is already bound to a different retarget")
      }
      return previous.generation
    }
    const generation = this.authorize(target.atom, target.declaration, target.key)
    this.#retargeted.set(targetIdentity, {
      entryId,
      generation,
      pendingAuthorization: true,
    })
    return generation
  }
  assert(atom: number, declaration: number, key: string, generation: number): void {
    const identity = this.identity(atom, declaration, key)
    if (this.#fenced.has(identity) || !this.#live.has(`${identity}\0${generation}`)) {
      throw new Error("Energy Mass handle generation is not live")
    }
  }
}

type DirectoryWriter = {controller: AbortController}
// Exclusivity is by persisted key within this process, across Atom bindings and catalogs.
const directoryWriters = new Map<string, DirectoryWriter>()
type Guard = {gate: EnergyMassGate; atom: number; generation: number}

/** Energy-owned file/directory materialization. Key identity, not caller input, determines its path. */
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

  async readBounded(keyId: string, format: MassFileFormat, maxBytes: number): Promise<Uint8Array> {
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error("Mass read limit is invalid")
    await this.ensureRoot()
    const target = this.path(keyId, format)
    await this.verifyTarget(target)
    let handle: Awaited<ReturnType<typeof open>> | undefined
    try {
      handle = await open(target, "r")
      const info = await handle.stat()
      if (!info.isFile()) throw new Error("Energy Mass key target is not a regular file")
      const current = await lstat(target)
      if (current.isSymbolicLink() || current.dev !== info.dev || current.ino !== info.ino) {
        throw new Error("Energy Mass key target changed during read")
      }
      if (info.size > maxBytes) throw new Error(`Energy Mass result exceeds ${maxBytes} bytes`)
      const output = new Uint8Array(maxBytes + 1)
      let length = 0
      while (length < output.length) {
        const {bytesRead} = await handle.read(output, length, output.length - length, length)
        if (bytesRead === 0) break
        length += bytesRead
      }
      if (length > maxBytes) throw new Error(`Energy Mass result exceeds ${maxBytes} bytes`)
      return output.slice(0, length)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Uint8Array()
      throw error
    } finally {
      await handle?.close().catch(() => undefined)
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

  private async directoryPath(keyId: string, create = true): Promise<string> {
    if (!keyPattern.test(keyId)) throw new Error("Energy Mass key is not a Boundary-issued key ID")
    const target = join(this.root, `${keyId}.dir`)
    const parts: string[] = []
    let current = this.root
    while (current !== dirname(current)) {parts.unshift(current); current = dirname(current)}
    const verify = async () => {
      for (const path of [...parts, target]) {
        try {
          const info = await lstat(path)
          if (info.isSymbolicLink() || !info.isDirectory()) throw new Error("Directory Mass path must contain real directories only")
        } catch (error) {
          if (!create || (error as NodeJS.ErrnoException).code !== "ENOENT") throw error
        }
      }
    }
    await verify()
    if (!create) return target
    await mkdir(this.root, {recursive: true, mode: 0o700})
    await mkdir(target, {mode: 0o700}).catch(error => {if (error.code !== "EEXIST") throw error})
    await verify()
    return target
  }

  /** Owner-internal readonly location; caller resolves the key from a canonical declaration first. */
  async locateDirectory(keyId: string): Promise<string> {return await this.directoryPath(keyId, false)}

  private directoryHandle(artifact: Pick<EnergyMassArtifact, "id" | "keyId" | "format">, guard?: Guard): MassDirectoryHandle {
    return {
      acquire: async (): Promise<MassDirectoryLease> => {
        if (!guard) throw new Error("Directory Mass requires Boundary-authorized generation")
        guard.gate.assert(guard.atom, artifact.id, artifact.keyId, guard.generation)
        const key = `${this.root}\0${artifact.keyId}`
        if (directoryWriters.has(key)) throw new Error("Directory Mass writer lease is busy, including retired generations")
        const writer: DirectoryWriter = {controller: new AbortController()}
        directoryWriters.set(key, writer)
        let unwatch = () => {}
        try {
          unwatch = guard.gate.watch(guard.atom, artifact.id, artifact.keyId, guard.generation, writer.controller)
          const path = await this.directoryPath(artifact.keyId)
          guard.gate.assert(guard.atom, artifact.id, artifact.keyId, guard.generation)
          let released = false
          return Object.freeze({path, signal: writer.controller.signal, release: async () => {
            if (released) return
            released = true
            unwatch()
            writer.controller.abort(new Error("Directory Mass lease released"))
            if (directoryWriters.get(key) === writer) directoryWriters.delete(key)
          }})
        } catch (error) {
          unwatch()
          if (directoryWriters.get(key) === writer) directoryWriters.delete(key)
          // Filesystem diagnostics may contain host paths; keep them out of Process result Fields.
          throw new Error(error instanceof Error && error.message.startsWith("Directory Mass") ? error.message : "Directory Mass path preparation failed")
        }
      },
    }
  }

  handle(artifact: {id: number; keyId: string; format: "directory"}, guard?: Guard): MassDirectoryHandle
  handle(artifact: {id: number; keyId: string; format: MassFileFormat}, guard?: Guard): EnergyMassHandle
  handle(artifact: Pick<EnergyMassArtifact, "id" | "keyId" | "format">, guard?: Guard): EnergyMassHandle | MassDirectoryHandle
  handle(artifact: Pick<EnergyMassArtifact, "id" | "keyId" | "format">, guard?: Guard): EnergyMassHandle | MassDirectoryHandle {
    if (artifact.format === "directory") return this.directoryHandle(artifact, guard)
    const format = artifact.format
    const live = (): void => guard?.gate.assert(guard.atom, artifact.id, artifact.keyId, guard.generation)
    return {
      keyId: artifact.keyId,
      format,
      readBytes: async () => { live(); return await this.read(artifact.keyId, format) },
      readText: async () => {live(); return new TextDecoder().decode(await this.read(artifact.keyId, format))},
      readJson: async <Value>() => {live(); return JSON.parse(new TextDecoder().decode(await this.read(artifact.keyId, format))) as Value},
      write: async value => {
        live()
        if (format === "json") await this.write(artifact.keyId, format, JSON.stringify(value))
        else if (value instanceof Uint8Array) await this.write(artifact.keyId, format, value)
        else throw new Error("Binary Mass accepts Uint8Array only")
      },
    }
  }
}

/** Energy-local handle projection; leases are not causal work and do not delay quiescence. */
export const createFilesystemEnergyMassStore = (
  gate = new EnergyMassGate(),
  catalog = new EnergyMassCatalog(),
): EnergyMassStore => {
  const values = new Map<string, Record<string, unknown>>()
  const grants = new Map<string, Array<{atom: number; artifact: EnergyMassArtifact; generation: number}>>()
  const keyOf = (ctx: EnergyMassContext): string => `${ctx.wimp}\0${ctx.atomId}`
  const retire = (entry: {atom: number; artifact: EnergyMassArtifact; generation: number}) => {
    // Retired destroy keeps the existing file-handle contract; directory acquire must cease immediately.
    if (entry.artifact.format === "directory") gate.revoke(entry.atom, entry.artifact.id, entry.artifact.keyId, entry.generation)
  }
  return {
    get(ctx) {
      const key = keyOf(ctx)
      let value = values.get(key)
      if (!value) {value = {}; values.set(key, value)}
      return value
    },
    bind(ctx, value) {values.set(keyOf(ctx), value)},
    authorize(ctx, artifacts) {
      const key = keyOf(ctx)
      const previous = grants.get(key) ?? []
      for (const entry of previous) if (!artifacts.some(artifact => artifact.id === entry.artifact.id && artifact.keyId === entry.artifact.keyId)) retire(entry)
      const next = artifacts.map(artifact => {
        const current = artifact.format === "directory" ? previous.find(entry =>
          entry.artifact.id === artifact.id && entry.artifact.keyId === artifact.keyId && entry.artifact.format === artifact.format,
        ) : undefined
        // File handles retain their existing generation refresh contract. A live directory grant survives metadata republishing.
        let generation: number | undefined
        if (current) {
          try {if (gate.generation(ctx.atomId, artifact.id, artifact.keyId) === current.generation) generation = current.generation} catch {}
        }
        generation ??= gate.authorize(ctx.atomId, artifact.id, artifact.keyId)
        return {atom: ctx.atomId, artifact, generation}
      })
      grants.set(key, next)
      values.set(key, Object.fromEntries(next.map(entry => [entry.artifact.key, catalog.handle(entry.artifact, {gate, atom: entry.atom, generation: entry.generation})])))
    },
    clear() {
      for (const entries of grants.values()) for (const entry of entries) retire(entry)
      grants.clear()
      values.clear()
    },
  }
}
