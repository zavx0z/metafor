import {copyFile, link, mkdir, readdir, rename, rm} from "node:fs/promises"
import {dirname, join, relative, resolve, sep} from "node:path"
import {packageArtifact, sourceMapArtifact, type PackageBuildArtifact, type PackageOwner} from "@metafor/tech-build"
import {
  type PackageEnvironment,
  isPackageEnvironment,
  isPackageArtifactKey,
  isSha256,
  rootPackageArtifact,
} from "@metafor/tech-build/identity"
import {versionedPackageArtifactPath, type PackageArtifactStorageOwner} from "./artifact-path"
import type {ReleaseFileOperations} from "./contracts"

/** Внутреннее доказательство подготовки; не декларация exports и не browser manifest. */
export interface PreparedEnvironment {
  name: string
  version: string
  env: PackageEnvironment
  owner: PackageOwner & PackageArtifactStorageOwner
  dependencies: Record<string, unknown>
  environments: PackageEnvironment[]
  outputs: PackageBuildArtifact[]
}

/** Сохраняет подготовленные байты до публикации, чтобы продолжение не вызывало компилятор. */
export function createReleaseStorage(
  root: string,
  io: ReleaseFileOperations = {},
) {
  const linkArtifact = io.link ?? link
  const renameArtifact = io.rename ?? rename
  const copyArtifact = io.copyFile ?? copyFile
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
    const marker = Bun.file(join(directory, "ready"))
    if (await marker.exists()) {
      const source = await marker.text()
      if (source.trim() === "ready")
        throw new Error(`Unverified legacy release proof: ${name}@${version}`)
      let proof: {receipts: Record<string, {sha256: string; size: number}>}
      try { proof = JSON.parse(source) } catch (error) {
        throw new Error(`Invalid published release proof: ${name}@${version}`, {cause: error})
      }
      if (!proof || !proof.receipts || Object.keys(proof.receipts).length === 0)
        throw new Error(`Invalid published release proof: ${name}@${version}`)
      for (const [env, expected] of Object.entries(proof.receipts)) {
        if (!isPackageEnvironment(env) || !expected || !isSha256(expected.sha256) || !Number.isSafeInteger(expected.size) || expected.size <= 0)
          throw new Error(`Invalid published release proof: ${name}@${version}/${env}`)
        const actual = await packageArtifact(join(directory, `${env}.json`))
        if (!actual) throw new Error(`Published environment record is missing: ${name}:${env}@${version}`)
        if (actual.sha256 !== expected.sha256 || actual.size !== expected.size)
          throw new Error(`Published environment record is corrupt: ${name}:${env}@${version}`)
      }
      if (entries.filter((entry) => entry.endsWith(".json")).length !== Object.keys(proof.receipts).length)
        throw new Error(`Published environment records changed: ${name}@${version}`)
    }
    const records = await Promise.all(
      entries
        .filter((entry) => entry.endsWith(".json"))
        .sort()
        .map(async (entry) => {
          let record: PreparedEnvironment
          try {
            record = (await Bun.file(join(directory, entry)).json()) as PreparedEnvironment
          } catch (error) {
            throw new Error(`Invalid prepared release record ${name}@${version}/${entry}: ${error instanceof Error ? error.message : String(error)}`, {cause: error})
          }
          if (
            !record ||
            record.name !== name ||
            record.version !== version ||
            !isPackageEnvironment(record.env) ||
            entry !== `${record.env}.json` ||
            !Array.isArray(record.outputs) ||
            record.outputs.length === 0 ||
            !Array.isArray(record.environments) ||
            record.environments.length === 0 ||
            record.environments.some((env) => !isPackageEnvironment(env)) ||
            !record.environments.includes(record.env) ||
            !record.owner ||
            typeof record.owner.root !== "string" ||
            record.owner.env !== record.env ||
            !Array.isArray(record.owner.sources) ||
            record.owner.sources.length === 0 ||
            new Set(record.environments).size !== record.environments.length
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
          const artifacts = new Set<string>()
          const mapOwners = new Set<string>()
          for (const output of record.outputs) {
            const slot = output.kind === "sourcemap" ? `map\0${output.artifact}\0${output.sourceMapFor}` : `artifact\0${output.artifact}`
            if (artifacts.has(slot))
              throw new Error(`Duplicate prepared artifact: ${name}:${record.env}@${version} ${output.artifact}`)
            artifacts.add(slot)
            if (output.kind === "sourcemap") {
              if (mapOwners.has(output.sourceMapFor!))
                throw new Error(`Duplicate prepared source map owner: ${name}:${record.env}@${version} ${output.sourceMapFor}`)
              mapOwners.add(output.sourceMapFor!)
            }
            const expectedPath = output.kind === "sourcemap"
              ? output.sourceMapFor === undefined ? null : sourceMapArtifact(versionedPackageArtifactPath(record.owner, version, output.sourceMapFor))
              : versionedPackageArtifactPath(record.owner, version, output.artifact!)
            if (expectedPath === null || resolve(output.path) !== resolve(expectedPath))
              throw new Error(`Prepared artifact path differs from identity: ${name}:${record.env}@${version} ${output.artifact}`)
            if (output.kind === "sourcemap" && (output.sourceMapFor === undefined || !record.outputs.some((target) => target.kind !== "sourcemap" && target.artifact === output.sourceMapFor)))
              throw new Error(`Prepared source map lacks its owner: ${name}:${record.env}@${version}`)
          }
          const root = record.outputs.find((output) => output.artifact === rootPackageArtifact && output.kind === "entry-point")
          if (!root) throw new Error(`Prepared root is missing: ${name}:${record.env}@${version}`)
          const aliases = record.owner.publicArtifactExtensions
          const publicArtifacts = aliases === undefined ? record.owner.sources.map(({artifact}) => artifact) : [rootPackageArtifact, ...Object.keys(aliases)]
          for (const artifact of publicArtifacts) {
            if (!record.outputs.some((output) => output.kind !== "sourcemap" && output.artifact === artifact))
              throw new Error(`Prepared public artifact is missing: ${name}:${record.env}@${version} ${artifact}`)
          }
          return record
        }),
    )
    if (records.some((record) => JSON.stringify([...record.environments].sort()) !== JSON.stringify([...records[0]!.environments].sort())))
      throw new Error(`Prepared environment membership differs: ${name}@${version}`)
    return records
  }

  async function save(record: PreparedEnvironment, sources: readonly PackageBuildArtifact[]) {
    for (const output of sources) {
      const actual = await packageArtifact(output.path)
      if (!actual || actual.sha256 !== output.sha256 || actual.size !== output.size)
        throw new Error(`Prepared artifact differs from build result: ${output.path}`)
      await copyVerified(
        output.path,
        objectPath(output.sha256),
        output,
        undefined,
        linkArtifact,
        renameArtifact,
        copyArtifact,
      )
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
      await renameArtifact(temporary, file)
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
        linkArtifact,
        renameArtifact,
        copyArtifact,
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
    const records = await read(name, version)
    if (records.length === 0) throw new Error(`Cannot mark release ready without prepared records: ${name}@${version}`)
    const receipts = Object.fromEntries(await Promise.all(records.map(async ({env}) => {
      const artifact = (await packageArtifact(join(receiptDirectory(name, version), `${env}.json`)))!
      return [env, {sha256: artifact.sha256, size: artifact.size}]
    })))
    await mkdir(dirname(file), {recursive: true})
    const temporary = `${file}.${crypto.randomUUID()}.tmp`
    try {
      await Bun.write(temporary, JSON.stringify({receipts}))
      await renameArtifact(temporary, file)
    } finally {
      await rm(temporary, {force: true})
    }
  }
  return {read, save, restore, isReady, markReady}
}

async function copyVerified(
  source: string,
  target: string,
  expected: PackageBuildArtifact,
  alias?: string,
  linkArtifact: typeof link = link,
  renameArtifact: typeof rename = rename,
  copyArtifact: typeof copyFile = copyFile,
) {
  const existing = await packageArtifact(target)
  if (!existing && (await Bun.file(target).exists()))
    throw new Error(`Immutable artifact is empty: ${target}`)
  if (existing) {
    if (existing.sha256 !== expected.sha256 || existing.size !== expected.size)
      throw new Error(`Immutable artifact conflict: ${target}`)
    return
  }
  const trustedSource = alias ?? source
  const trusted = await packageArtifact(trustedSource)
  if (!trusted || trusted.sha256 !== expected.sha256 || trusted.size !== expected.size)
    throw new Error(`Trusted artifact copy is missing or corrupt: ${trustedSource}`)
  await mkdir(dirname(target), {recursive: true})
  const temporary = `${target}.${crypto.randomUUID()}.tmp`
  try {
    let linked = false
    if (alias) {
      try {
        await linkArtifact(alias, temporary)
        linked = true
      } catch {
        /* Другая файловая система: копируем байты. */
      }
    }
    if (!linked) await copyArtifact(trustedSource, temporary)
    const copied = await packageArtifact(temporary)
    if (!copied || copied.sha256 !== expected.sha256 || copied.size !== expected.size)
      throw new Error(`Artifact copy differs: ${target}`)
    await renameArtifact(temporary, target)
  } finally {
    await rm(temporary, {force: true})
  }
}

function inside(root: string, path: string) {
  const local = relative(resolve(root), resolve(path))
  return local !== "" && local !== ".." && !local.startsWith(`..${sep}`) && !local.startsWith(sep)
}
