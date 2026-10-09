import {copyFile, link, mkdir, readdir, rename, rm} from "node:fs/promises"
import {dirname, join, relative, resolve, sep} from "node:path"
import {packageArtifact, type PackageBuildArtifact, type PackageOwner} from "@metafor/tech-build"
import {
  type PackageEnvironment,
  isPackageEnvironment,
  isPackageArtifactKey,
  isSha256,
} from "@metafor/tech-build/identity"

/** Внутреннее доказательство подготовки; не декларация exports и не browser manifest. */
export interface PreparedEnvironment {
  name: string
  version: string
  env: PackageEnvironment
  owner: PackageOwner
  dependencies: Record<string, unknown>
  environments: PackageEnvironment[]
  outputs: PackageBuildArtifact[]
}

/** Сохраняет подготовленные байты до публикации, чтобы продолжение не вызывало компилятор. */
export function createReleaseStorage(root: string) {
  const directory = join(root, ".release")
  const receiptDirectory = (name: string, version: string) =>
    join(directory, "versions", encodeURIComponent(name), version)
  const objectPath = (sha256: string) => join(directory, "objects", sha256)

  async function read(name: string, version: string): Promise<PreparedEnvironment[]> {
    const directory = receiptDirectory(name, version)
    const entries = await readdir(directory).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return []
      throw error
    })
    return await Promise.all(
      entries
        .filter((entry) => entry.endsWith(".json"))
        .sort()
        .map(async (entry) => {
          const record = (await Bun.file(join(directory, entry)).json()) as PreparedEnvironment
          if (
            record.name !== name ||
            record.version !== version ||
            !isPackageEnvironment(record.env) ||
            entry !== `${record.env}.json` ||
            !Array.isArray(record.outputs) ||
            record.outputs.length === 0
          )
            throw new Error(`Invalid prepared release record ${name}@${version}/${entry}`)
          for (const output of record.outputs) {
            if (
              !isSha256(output.sha256) ||
              !Number.isSafeInteger(output.size) ||
              output.size <= 0 ||
              !isPackageArtifactKey(output.artifact) ||
              !inside(record.owner.root, output.path)
            )
              throw new Error(`Invalid prepared artifact ${name}@${version}/${entry}`)
          }
          return record
        }),
    )
  }

  async function save(record: PreparedEnvironment, sources: readonly PackageBuildArtifact[]) {
    for (const output of sources) {
      const actual = await packageArtifact(output.path)
      if (!actual || actual.sha256 !== output.sha256 || actual.size !== output.size)
        throw new Error(`Prepared artifact differs from build result: ${output.path}`)
      await copyVerified(output.path, objectPath(output.sha256), output)
    }
    const file = join(receiptDirectory(record.name, record.version), `${record.env}.json`)
    const existing = (await read(record.name, record.version)).find(({env}) => env === record.env)
    if (existing) {
      if (JSON.stringify(existing.outputs) !== JSON.stringify(record.outputs))
        throw new Error(
          `Immutable prepared version conflict: ${record.name}:${record.env}@${record.version}`,
        )
      return
    }
    await mkdir(dirname(file), {recursive: true})
    const temporary = `${file}.${crypto.randomUUID()}.tmp`
    try {
      await Bun.write(temporary, JSON.stringify(record))
      await rename(temporary, file)
    } finally {
      await rm(temporary, {force: true})
    }
  }

  async function restore(record: PreparedEnvironment) {
    const verified = new Map<string, string>()
    for (const output of record.outputs) {
      const existing = await packageArtifact(output.path)
      if (existing && (existing.sha256 !== output.sha256 || existing.size !== output.size))
        throw new Error(`Immutable artifact conflict: ${output.path}`)
      if (existing) verified.set(output.sha256, output.path)
    }
    for (const output of record.outputs) {
      await copyVerified(
        objectPath(output.sha256),
        output.path,
        output,
        verified.get(output.sha256),
      )
      verified.set(output.sha256, output.path)
    }
    return record.outputs
  }

  async function isReady(name: string, version: string) {
    return await Bun.file(join(receiptDirectory(name, version), "ready")).exists()
  }
  async function markReady(name: string, version: string) {
    const file = join(receiptDirectory(name, version), "ready")
    if (await Bun.file(file).exists()) return
    await mkdir(dirname(file), {recursive: true})
    await Bun.write(file, "ready\n")
  }
  return {read, save, restore, isReady, markReady}
}

async function copyVerified(
  source: string,
  target: string,
  expected: PackageBuildArtifact,
  alias?: string,
) {
  const existing = await packageArtifact(target)
  if (!existing && (await Bun.file(target).exists()))
    throw new Error(`Immutable artifact is empty: ${target}`)
  if (existing) {
    if (existing.sha256 !== expected.sha256 || existing.size !== expected.size)
      throw new Error(`Immutable artifact conflict: ${target}`)
    return
  }
  const trusted = await packageArtifact(source)
  if (!trusted || trusted.sha256 !== expected.sha256 || trusted.size !== expected.size)
    throw new Error(`Trusted artifact copy is missing or corrupt: ${source}`)
  await mkdir(dirname(target), {recursive: true})
  const temporary = `${target}.${crypto.randomUUID()}.tmp`
  try {
    let linked = false
    if (alias) {
      try {
        await link(alias, temporary)
        linked = true
      } catch {
        /* Другая файловая система: копируем байты. */
      }
    }
    if (!linked) await copyFile(source, temporary)
    const copied = await packageArtifact(temporary)
    if (!copied || copied.sha256 !== expected.sha256 || copied.size !== expected.size)
      throw new Error(`Artifact copy differs: ${target}`)
    await rename(temporary, target)
  } finally {
    await rm(temporary, {force: true})
  }
}

function inside(root: string, path: string) {
  const local = relative(resolve(root), resolve(path))
  return local !== "" && local !== ".." && !local.startsWith(`..${sep}`) && !local.startsWith(sep)
}
