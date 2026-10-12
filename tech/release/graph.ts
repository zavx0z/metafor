import {createHash} from "node:crypto"
import {
  isGeneratedPackageArtifactKey,
  isPackageArtifactKey,
  isPackageEnvironment,
  type PackageArtifactKey,
  type PackageEnvironment,
} from "@metafor/tech-build/identity"

/** Переносимое доказательство одного output, независимое от source и filesystem отправителя. */
export interface PublishedReleaseOutput {
  readonly artifact: PackageArtifactKey
  readonly kind: "entry-point" | "chunk" | "asset" | "copy" | "sourcemap"
  readonly type: string
  readonly sha256: string
  readonly size: number
  readonly load?: "eager" | "lazy"
  readonly sourceMapFor?: PackageArtifactKey
}

export interface PublishedReleaseEnvironment {
  readonly env: PackageEnvironment
  /** Public artifact key → физическое расширение сохранённого alias. */
  readonly publicArtifacts: Readonly<Record<string, string>>
  readonly outputs: readonly PublishedReleaseOutput[]
}

export interface PublishedReleasePackage {
  readonly name: string
  readonly version: string
  /** Только dependency edges внутри этого полного состава; обычные dependencies входят в bytes. */
  readonly dependencies: Readonly<Record<string, string>>
  readonly environments: readonly PublishedReleaseEnvironment[]
}

/**
Проекция подтверждённого графа [выпуска](./README.md), без второго authoring registry.
Источник байтов и локальные пути не входят в identity. Все объявленные части
пакета и отложенные outputs сохраняются вместе с root. Проверки находятся в
`spec/installed.spec.ts` и `spec/published-graph.spec.ts`.
*/
export interface PublishedReleaseGraph {
  readonly schemaVersion: 1
  readonly packages: readonly PublishedReleasePackage[]
}

/** Exact lookup одной части выбранного состава, включая ожидаемую целостность. */
export interface InstalledArtifactIdentity {
  readonly name: string
  readonly version: string
  readonly env: PackageEnvironment
  readonly artifact: PackageArtifactKey
  readonly sha256: string
  readonly size: number
}

/** Получение bytes принадлежит потребителю; этот contract не выбирает сеть или peers. */
export interface ReleaseArtifactSource {
  read(identity: InstalledArtifactIdentity): Promise<
    ReadableStream<Uint8Array> | AsyncIterable<Uint8Array> | Uint8Array
  >
}

export const releaseGraphLimits = Object.freeze({packages: 128, outputs: 4096, bytes: 4 * 1024 * 1024})

/** Строго проверяет и канонизирует полный переносимый состав до filesystem side effects. */
export function validatePublishedReleaseGraph(value: unknown): PublishedReleaseGraph {
  const graph = exact(value, ["schemaVersion", "packages"])
  if (graph.schemaVersion !== 1) throw new Error("Unsupported release graph version")
  const packages = array(graph.packages, releaseGraphLimits.packages, "packages").map(value => {
    const member = exact(value, ["name", "version", "dependencies", "environments"])
    if (typeof member.name !== "string" || !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(member.name))
      throw new Error("Invalid release package name")
    if (!version(member.version)) throw new Error("Invalid release package version")
    const dependencies = record(member.dependencies)
    const environments = array(member.environments, 5, "environments").map(value => {
      const part = exact(value, ["env", "publicArtifacts", "outputs"])
      if (typeof part.env !== "string" || !isPackageEnvironment(part.env)) throw new Error("Invalid release environment")
      const publicArtifacts = record(part.publicArtifacts)
      for (const [key, extension] of Object.entries(publicArtifacts)) {
        if (!isPackageArtifactKey(key) || key === "." || isGeneratedPackageArtifactKey(key) ||
          typeof extension !== "string" || !/^\.[A-Za-z0-9._+-]+$/.test(extension))
          throw new Error("Invalid public artifact extension")
      }
      const outputs = array(part.outputs, releaseGraphLimits.outputs, "outputs").map(value => {
        const output = exact(value, ["artifact", "kind", "type", "sha256", "size"], ["load", "sourceMapFor"])
        if (!isPackageArtifactKey(output.artifact) ||
          !["entry-point", "chunk", "asset", "copy", "sourcemap"].includes(String(output.kind)) ||
          typeof output.type !== "string" || output.type.length === 0 || output.type.length > 256 || /[\x00-\x1f\x7f]/.test(output.type) ||
          !digest(output.sha256) || !Number.isSafeInteger(output.size) || Number(output.size) <= 0 ||
          (output.load !== undefined && output.load !== "eager" && output.load !== "lazy") ||
          (output.sourceMapFor !== undefined && !isPackageArtifactKey(output.sourceMapFor)))
          throw new Error("Invalid release output")
        if ((output.kind === "sourcemap") !== (output.sourceMapFor !== undefined))
          throw new Error("Invalid source map owner")
        if (isGeneratedPackageArtifactKey(output.artifact) && output.kind !== "sourcemap" &&
          !/^\.\/\.cosmos\/(entry|chunk|asset)\//.test(output.artifact))
          throw new Error("Invalid generated artifact root")
        return Object.freeze({
          artifact: output.artifact,
          kind: output.kind,
          type: output.type,
          sha256: output.sha256,
          size: output.size,
          ...(output.load === undefined ? {} : {load: output.load}),
          ...(output.sourceMapFor === undefined ? {} : {sourceMapFor: output.sourceMapFor}),
        }) as unknown as PublishedReleaseOutput
      }).sort((a, b) => compare(a.artifact, b.artifact) || compare(a.kind, b.kind) || compare(a.sourceMapFor ?? "", b.sourceMapFor ?? ""))
      // Один generated map может сопровождать public и generated aliases
      // одного output; receipt различает эти slots по sourceMapFor.
      unique(outputs.map(output => output.kind === "sourcemap"
        ? `map\0${output.artifact}\0${output.sourceMapFor}`
        : `artifact\0${output.artifact}`), "output")
      if (!outputs.some(output => output.artifact === "." && output.kind === "entry-point"))
        throw new Error("Release environment root is missing")
      for (const output of outputs) {
        if (output.kind === "sourcemap") {
          if (!outputs.some(target => target.artifact === output.sourceMapFor && target.kind !== "sourcemap"))
            throw new Error("Release source map owner is missing")
        } else if (output.artifact !== "." && !isGeneratedPackageArtifactKey(output.artifact) && !Object.hasOwn(publicArtifacts, output.artifact))
          throw new Error("Public artifact declaration is missing")
      }
      unique(outputs.filter(output => output.kind === "sourcemap").map(output => output.sourceMapFor!), "source map owner")
      for (const key of Object.keys(publicArtifacts)) {
        if (!outputs.some(output => output.artifact === key && output.kind !== "sourcemap"))
          throw new Error("Declared public artifact output is missing")
      }
      return Object.freeze({env: part.env, publicArtifacts: sorted(publicArtifacts), outputs: Object.freeze(outputs)}) as PublishedReleaseEnvironment
    }).sort((a, b) => compare(a.env, b.env))
    unique(environments.map(part => part.env), "environment")
    return Object.freeze({name: member.name, version: member.version, dependencies: sorted(dependencies), environments: Object.freeze(environments)}) as PublishedReleasePackage
  }).sort((a, b) => compare(a.name, b.name))
  unique(packages.map(member => member.name), "package")
  if (packages.reduce((count, member) => count + member.environments.reduce((count, part) => count + part.outputs.length, 0), 0) > releaseGraphLimits.outputs)
    throw new Error("Release graph output limit exceeded")
  const members = new Map(packages.map(member => [member.name, member]))
  const integritySizes = new Map<string, number>()
  for (const member of packages) for (const part of member.environments) for (const output of part.outputs) {
    const previous = integritySizes.get(output.sha256)
    if (previous !== undefined && previous !== output.size) throw new Error("Release artifact integrity sizes differ")
    integritySizes.set(output.sha256, output.size)
  }
  for (const member of packages) for (const [name, range] of Object.entries(member.dependencies)) {
    const selected = members.get(name)
    if (!selected || typeof range !== "string" || !satisfies(selected.version, range))
      throw new Error(`Unsatisfied release dependency ${member.name} → ${name}`)
  }
  const result = Object.freeze({schemaVersion: 1 as const, packages: Object.freeze(packages)})
  if (Buffer.byteLength(JSON.stringify(result)) > releaseGraphLimits.bytes) throw new Error("Release graph metadata limit exceeded")
  return result
}

/** Digest одного канонического графа; source адрес и filesystem не меняют identity. */
export function publishedReleaseGraphDigest(value: PublishedReleaseGraph): string {
  return createHash("sha256").update(JSON.stringify(validatePublishedReleaseGraph(value))).digest("hex")
}

export function isReleaseDigest(value: unknown): value is string {
  return digest(value)
}

function digest(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value) }
function version(value: unknown): value is string { return typeof value === "string" && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value) }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype)
    throw new Error("Invalid release graph record")
  return value as Record<string, unknown>
}
function exact(value: unknown, required: string[], optional: string[] = []) {
  const result = record(value)
  if (required.some(key => !Object.hasOwn(result, key)) || Object.keys(result).some(key => !required.includes(key) && !optional.includes(key)))
    throw new Error("Invalid release graph fields")
  return result
}
function array(value: unknown, max: number, label: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) throw new Error(`Invalid release graph ${label}`)
  return value
}
function sorted(value: Record<string, unknown>) { return Object.freeze(Object.fromEntries(Object.entries(value).sort(([a], [b]) => compare(a, b)))) }
function compare(a: string, b: string) {return a < b ? -1 : a > b ? 1 : 0}
function unique(values: string[], label: string) { if (new Set(values).size !== values.length) throw new Error(`Duplicate release ${label}`) }
function satisfies(selected: string, range: string) {
  if (range === "workspace:*") return true
  const bare = range.replace(/^workspace:/, "")
  const match = /^(\^|~)?((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/.exec(bare)
  if (!match) return false
  if (!match[1]) return selected === match[2]
  const a = selected.split(".").map(Number)
  const b = match[2]!.split(".").map(Number)
  const compare = a[0]! - b[0]! || a[1]! - b[1]! || a[2]! - b[2]!
  if (compare < 0) return false
  if (match[1] === "~") return a[0] === b[0] && a[1] === b[1]
  if (b[0]! > 0) return a[0] === b[0]
  if (b[1]! > 0) return a[0] === 0 && a[1] === b[1]
  return selected === match[2]
}
