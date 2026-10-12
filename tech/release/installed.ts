import {packageVersionArtifactPath} from "@metafor/tech-build/identity"
import {constants} from "node:fs"
import {lstat, mkdir, open, link, rename, rm, realpath, opendir} from "node:fs/promises"
import {dirname, join, relative, resolve, sep} from "node:path"
import {createHash} from "node:crypto"
import {
  isReleaseDigest,
  publishedReleaseGraphDigest,
  releaseGraphLimits,
  validatePublishedReleaseGraph,
  type InstalledArtifactIdentity,
  type PublishedReleaseGraph,
  type PublishedReleaseOutput,
  type ReleaseArtifactSource,
} from "./graph"

export * from "./graph"

export interface InstalledReleaseCandidate {
  readonly digest: string
  readonly graph: PublishedReleaseGraph
}

export interface InstalledReleaseStoreOptions {
  /** Единственный явно предоставленный корень installed storage; не source checkout. */
  readonly root: string
  readonly limits?: {readonly artifactBytes?: number; readonly totalBytes?: number}
}

const queues = new Map<string, Promise<unknown>>()

/**
Принимает готовый [граф выпуска](./README.md) без source manifests и compiler.
Подготовка сохраняет verified objects и candidate отдельно от active selection.
Только вызывающий startup выполняет `commitActive` после своей lifecycle проверки.
Повтор продолжает загрузку с verified objects, symlinks и immutable conflicts
отклоняются. Файлы и directories синхронизируются перед возвратом операции.
Artifact streams записываются последовательно во временный файл с инкрементной
проверкой SHA-256 и размера. Следующий chunk запрашивается после записи текущего;
chunks не накапливаются. Проверка и materialization локальных artifacts читают
по 64 KiB. Ограничения полного состава сохраняются; resume остаётся по целым
verified objects, а не по byte offsets. Малые metadata читаются целиком.
Проверки разных storage roots и прерываний: `spec/installed.spec.ts`.
*/
export function createInstalledReleaseStore(options: InstalledReleaseStoreOptions) {
  const configuredRoot = resolve(options.root)
  const artifactLimit = limit(options.limits?.artifactBytes, 64 * 1024 * 1024)
  const totalLimit = limit(options.limits?.totalBytes, 512 * 1024 * 1024)
  let rootPromise: Promise<string> | undefined

  async function root() {
    rootPromise ??= (async () => {
      const created = await mkdir(configuredRoot, {recursive: true})
      const status = await lstat(configuredRoot)
      if (!status.isDirectory() || status.isSymbolicLink()) throw new Error("Installed release root must be a real directory")
      if (created) {
        let current = configuredRoot
        const boundary = dirname(created)
        for (;;) {
          await syncDirectory(current)
          if (current === boundary) break
          current = dirname(current)
        }
      }
      return await realpath(configuredRoot)
    })()
    return await rootPromise
  }

  async function safe(path: string, create = false) {
    const base = await root()
    const suffix = relative(base, path)
    if (!suffix || suffix === ".." || suffix.startsWith(`..${sep}`) || suffix.startsWith(sep))
      throw new Error("Installed release path escapes root")
    const parts = suffix.split(sep)
    let current = base
    for (const [index, part] of parts.entries()) {
      current = join(current, part)
      if (create && index < parts.length - 1) {
        let created = false
        await mkdir(current).then(() => {created = true}).catch(error => { if (error.code !== "EEXIST") throw error })
        if (created) await syncDirectory(dirname(current))
      }
      const status = await lstat(current).catch(error => { if (error.code === "ENOENT") return null; throw error })
      if (!status) continue
      if (status.isSymbolicLink() || (index < parts.length - 1 ? !status.isDirectory() : !status.isFile()))
        throw new Error(`Installed release path is not a regular file: ${current}`)
    }
    return path
  }

  async function read(path: string, maximum: number): Promise<Uint8Array | null> {
    await safe(path)
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW).catch(error => {
      if (error.code === "ENOENT") return null
      throw error
    })
    if (!file) return null
    try {
      const status = await file.stat()
      if (!status.isFile() || status.size <= 0 || status.size > maximum) throw new Error("Installed release file size is invalid")
      const buffer = Buffer.alloc(status.size + 1)
      let offset = 0
      while (offset < buffer.length) {
        const result = await file.read(buffer, offset, buffer.length - offset, offset)
        if (result.bytesRead === 0) break
        offset += result.bytesRead
      }
      if (offset !== status.size) throw new Error("Installed release file changed during read")
      return buffer.subarray(0, offset)
    } finally { await file.close() }
  }

  async function syncDirectory(path: string) {
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    try { await handle.sync() } finally { await handle.close() }
  }

  async function write(path: string, bytes: Uint8Array, immutable = true) {
    await safe(path, true)
    const previous = await read(path, Math.max(bytes.length, releaseGraphLimits.bytes))
    if (previous && immutable) {
      if (!Buffer.from(previous).equals(bytes)) throw new Error(`Immutable installed release conflict: ${path}`)
      return
    }
    const temporary = `${path}.${crypto.randomUUID()}.tmp`
    const file = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
    try {
      await file.writeFile(bytes)
      await file.sync()
      await file.close()
      if (immutable) {
        await link(temporary, path).catch(async error => {
          if (error.code !== "EEXIST") throw error
          const existing = await read(path, bytes.length)
          if (!existing || !Buffer.from(existing).equals(bytes)) throw new Error(`Immutable installed release conflict: ${path}`)
        })
      } else await rename(temporary, path)
      await syncDirectory(dirname(path))
    } finally {
      await file.close().catch(() => {})
      await rm(temporary, {force: true})
    }
  }

  const candidateDirectory = async (digest: string) => {
    if (!isReleaseDigest(digest)) throw new Error("Invalid installed release digest")
    return join(await root(), "candidates", digest)
  }

  /** Читает ready metadata; полную проверку bytes выполняет verifyCandidate или readActive. */
  async function candidate(digest: string): Promise<InstalledReleaseCandidate | null> {
    const directory = await candidateDirectory(digest)
    const marker = await read(join(directory, "ready"), 64)
    if (!marker) return null
    if (Buffer.from(marker).toString() !== digest) throw new Error("Installed release ready marker differs")
    const metadata = await read(join(directory, "graph.json"), releaseGraphLimits.bytes)
    if (!metadata) throw new Error("Installed release graph is missing")
    const graph = validatePublishedReleaseGraph(JSON.parse(Buffer.from(metadata).toString()))
    if (publishedReleaseGraphDigest(graph) !== digest) throw new Error("Installed release graph digest differs")
    for (const member of graph.packages) {
      const receipt = await read(join(await root(), "versions", encodeURIComponent(member.name), `${member.version}.json`), releaseGraphLimits.bytes)
      if (!receipt || Buffer.from(receipt).toString() !== JSON.stringify(member))
        throw new Error("Installed release immutable package receipt differs")
    }
    return Object.freeze({digest, graph})
  }

  async function* fileChunks(path: string) {
    await safe(path)
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      if (!(await file.stat()).isFile()) throw new Error("Installed release artifact must be a regular file")
      const buffer = Buffer.allocUnsafe(64 * 1024)
      for (;;) {
        const {bytesRead} = await file.read(buffer, 0, buffer.length, null)
        if (!bytesRead) break
        yield buffer.subarray(0, bytesRead)
      }
    } finally { await file.close() }
  }

  async function verifyFile(path: string, expected: {sha256: string; size: number}, missing = false) {
    const digest = createHash("sha256")
    let received = 0
    try {
      for await (const chunk of fileChunks(path)) {
        received += chunk.length
        if (received > expected.size) throw new Error(`Installed release artifact is missing or corrupt: ${path}`)
        digest.update(chunk)
      }
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        if (missing) return false
        throw new Error(`Installed release artifact is missing or corrupt: ${path}`)
      }
      throw error
    }
    if (received !== expected.size || digest.digest("hex") !== expected.sha256)
      throw new Error(`Installed release artifact is missing or corrupt: ${path}`)
    return true
  }

  async function writeArtifact(
    path: string,
    expected: {sha256: string; size: number},
    source: () => Promise<ReadableStream<Uint8Array> | AsyncIterable<Uint8Array> | Uint8Array>,
  ) {
    await safe(path, true)
    const existing = await verifyFile(path, expected, true).catch(error => {
      throw new Error(`Immutable installed release conflict: ${path}`, {cause: error})
    })
    if (existing) return
    const temporary = `${path}.${crypto.randomUUID()}.tmp`
    const file = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
    try {
      const digest = createHash("sha256")
      let received = 0
      for await (const chunk of receivedChunks(await source())) {
        if (!(chunk instanceof Uint8Array) || chunk.byteLength === 0) throw new Error("Invalid received release chunk")
        received += chunk.byteLength
        if (received > expected.size) throw new Error("Received release artifact exceeds expected size")
        digest.update(chunk)
        await file.writeFile(chunk)
      }
      if (received !== expected.size) throw new Error("Received release artifact size differs")
      if (digest.digest("hex") !== expected.sha256) throw new Error("Received release artifact hash differs")
      await file.sync()
      await file.close()
      await link(temporary, path).catch(async error => {
        if (error.code !== "EEXIST") throw error
        await verifyFile(path, expected).catch(cause => {
          throw new Error(`Immutable installed release conflict: ${path}`, {cause})
        })
      })
      await syncDirectory(dirname(path))
    } finally {
      await file.close().catch(() => {})
      await rm(temporary, {force: true})
    }
  }

  async function verifyCandidate(digest: string) {
    const current = await candidate(digest)
    if (!current) throw new Error("Installed release candidate is not ready")
    const directory = await candidateDirectory(digest)
    checkLimits(current.graph)
    for (const item of outputs(current.graph)) {
      await verifyFile(join(await root(), "objects", item.identity.sha256), item.identity)
      await verifyFile(join(directory, item.relative), item.identity)
    }
    return current
  }

  function checkLimits(graph: PublishedReleaseGraph) {
    const selected = outputs(graph)
    if (selected.some(item => item.identity.size > artifactLimit) || selected.reduce((sum, item) => sum + item.identity.size, 0) > totalLimit)
      throw new Error("Installed release byte limit exceeded")
    const paths = selected.map(item => item.relative)
    if (new Set(paths).size !== paths.length) throw new Error("Installed artifact paths collide")
  }

  async function prepare(value: PublishedReleaseGraph, source: ReleaseArtifactSource, expectedDigest?: string) {
    const graph = validatePublishedReleaseGraph(value)
    const digest = publishedReleaseGraphDigest(graph)
    if (expectedDigest !== undefined && expectedDigest !== digest) throw new Error("Requested release digest differs")
    checkLimits(graph)
    return await serialize(async () => {
      const directory = await candidateDirectory(digest)
      // Производный immutable receipt одной package version общий для всех
      // candidates: смена полного состава не переназначает exact package URL.
      for (const member of graph.packages) {
        await write(join(await root(), "versions", encodeURIComponent(member.name), `${member.version}.json`), Buffer.from(JSON.stringify(member)))
      }
      await write(join(directory, "graph.json"), Buffer.from(JSON.stringify(graph)))
      for (const item of outputs(graph)) {
        const object = join(await root(), "objects", item.identity.sha256)
        if (!await verifyFile(object, item.identity, true))
          await writeArtifact(object, item.identity, () => source.read(item.identity))
        await writeArtifact(join(directory, item.relative), item.identity, async () => fileChunks(object))
      }
      // ready возникает после проверки всего materialized graph, отдельно от active.
      for (const item of outputs(graph)) await verifyFile(join(directory, item.relative), item.identity)
      await write(join(directory, "ready"), Buffer.from(digest))
      return await verifyCandidate(digest)
    })
  }

  async function artifactPath(digest: string, identity: InstalledArtifactIdentity) {
    const current = await candidate(digest)
    if (!current) throw new Error("Installed release candidate is not ready")
    const found = outputs(current.graph).find(item => sameIdentity(item.identity, identity))
    if (!found) throw new Error("Artifact does not belong to installed release")
    const path = join(await candidateDirectory(digest), found.relative)
    await verifyFile(path, found.identity)
    return path
  }

  /** Только startup вызывает commit после проверки кандидата; prepare active не меняет. */
  async function commitActive(digest: string) {
    return await serialize(async () => {
      const selected = await verifyCandidate(digest)
      await write(join(await root(), "active.json"), Buffer.from(JSON.stringify({schemaVersion: 1, digest})), false)
      return selected
    })
  }

  async function readActive() {
    const bytes = await read(join(await root(), "active.json"), 256)
    if (!bytes) return null
    const value = JSON.parse(Buffer.from(bytes).toString())
    if (!value || Object.keys(value).sort().join() !== "digest,schemaVersion" || value.schemaVersion !== 1 || !isReleaseDigest(value.digest))
      throw new Error("Invalid active installed release")
    return await verifyCandidate(value.digest)
  }

  /** Перечисляет сохранённые ready candidates; pending и посторонние entries не являются выпусками. */
  async function listCandidates() {
    const directory = join(await root(), "candidates")
    await safe(join(directory, ".inventory"))
    const handle = await opendir(directory).catch(error => {if (error.code === "ENOENT") return null; throw error})
    if (!handle) return []
    const selected: InstalledReleaseCandidate[] = []
    let entries = 0
    for await (const entry of handle) {
      if (++entries > 1024) throw new Error("Installed release candidate inventory limit exceeded")
      if (entry.isSymbolicLink()) throw new Error("Installed release candidate must not be a symlink")
      if (!entry.isDirectory() || !isReleaseDigest(entry.name)) continue
      const value = await candidate(entry.name)
      if (value) selected.push(value)
    }
    return selected.sort((a, b) => a.digest < b.digest ? -1 : a.digest > b.digest ? 1 : 0)
  }

  async function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const key = await root()
    const previous = queues.get(key) ?? Promise.resolve()
    const running = previous.catch(() => {}).then(operation)
    queues.set(key, running)
    try { return await running } finally { if (queues.get(key) === running) queues.delete(key) }
  }

  return {prepare, readCandidate: candidate, verifyCandidate, artifactPath, commitActive, readActive, listCandidates}
}

function outputs(graph: PublishedReleaseGraph) {
  return graph.packages.flatMap(member => member.environments.flatMap(part => {
    const outputPath = (output: PublishedReleaseOutput): string => {
      if (output.kind === "sourcemap") {
        const owner = part.outputs.find(item => item.artifact === output.sourceMapFor && item.kind !== "sourcemap")!
        return `${outputPath(owner)}.map`
      }
      const version = join("packages", encodeURIComponent(member.name), "dist", "versions", member.version)
      return join(version, packageVersionArtifactPath(part.env, output.artifact, part.publicArtifacts[output.artifact]))
    }
    return part.outputs.map(output => ({
      identity: Object.freeze({name: member.name, version: member.version, env: part.env, artifact: output.artifact, sha256: output.sha256, size: output.size}),
      relative: outputPath(output),
    }))
  }))
}

async function* receivedChunks(body: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array> | Uint8Array) {
  if (body instanceof Uint8Array) yield body
  else if (body instanceof ReadableStream) {
    const reader = body.getReader()
    let completed = false
    try {
      for (;;) {
        const item = await reader.read()
        if (item.done) {completed = true; break}
        yield item.value
      }
    } finally {
      if (!completed) await reader.cancel().catch(() => {})
      reader.releaseLock()
    }
  } else yield* body
}
function sameIdentity(a: InstalledArtifactIdentity, b: InstalledArtifactIdentity) {
  return a.name === b.name && a.version === b.version && a.env === b.env && a.artifact === b.artifact && a.sha256 === b.sha256 && a.size === b.size
}
function limit(value: number | undefined, fallback: number) {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Invalid installed release byte limit")
  return value
}
