import {constants} from "node:fs"
import {createHash} from "node:crypto"
import {lstat, mkdir, open, readdir, realpath, rename, rm} from "node:fs/promises"
import {basename, isAbsolute, join, resolve} from "node:path"
import type {PackageBuilder} from "@metafor/tech-build"
import {
  createPublishedReleaseSource,
  type PackageChange,
  type PublishedReleaseGraph,
  type ReleaseArtifactSource,
  type ReleasePublicationEffects,
  type ReleasePublicationPlan,
  type createRelease,
} from "@metafor/tech-release"
import {createInstalledReleaseStore, publishedReleaseGraphDigest, validatePublishedReleaseGraph} from "@metafor/tech-release/installed"
import {readInstalledStateCompatibility} from "../../selection"
import type {
  DevelopmentCheckReceipt,
  DevelopmentPreparationCheck,
  DevelopmentPreparationEffects,
  DevelopmentPreparationProgress,
  DevelopmentPreparationReceipt,
  DevelopmentPreparationRequest,
  DevelopmentPrepareReceipt,
} from "../shared/preparation"

type Publication = Pick<ReturnType<typeof createRelease>,
  "planPublication" | "publishPackages" | "readPublicationEffects" | "publishedReleaseGraph" | "readPublishedArtifact">
type Store = ReturnType<typeof createInstalledReleaseStore>
type Progress = (value: DevelopmentPreparationProgress) => void

const changes: PackageChange[] = [
  {name: "@cosmos/release", change: "patch"},
  {name: "@internal/visual", change: "patch"},
]
const changedNames = new Set(changes.map(({name}) => name))
const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$/

export interface DevelopmentPreparationOptions {
  publication: Publication
  builder: Pick<PackageBuilder, "sourceInventory">
  store: Store
  /** Приватный каталог хоста вне областей исходников с правом записи. */
  receiptsDirectory: string
  /** Хост проверяет действующее право записи в назначенной комнате. */
  authorizeSubject(subject: string): void | Promise<void>
  assignmentRevision(): string | Promise<string>
  checks(subject: string, signal: AbortSignal | undefined, progress: Progress): Promise<readonly DevelopmentPreparationCheck[]>
  compatibility(graph: PublishedReleaseGraph, source: ReleaseArtifactSource): Promise<string | null>
}

/**
Сохраняет проверку и подготовку как отдельные квитанции. Подготовка использует
`@metafor/tech-release` и установленное хранилище; выбор действующего выпуска
остаётся у startup. Незавершённая операция после перезапуска читается с
неизвестным исходом и фактическими эффектами. Публикация и активация
автоматически не повторяются.
*/
export function createDevelopmentPreparation(options: DevelopmentPreparationOptions) {
  if (!isAbsolute(options.receiptsDirectory)) throw new Error("Preparation receipts directory must be absolute")
  const directory = resolve(options.receiptsDirectory)
  let active: Promise<unknown> | null = null
  let activeId: string | null = null
  let closed = false

  async function receiptPath(requestId: string) {
    requireRequestId(requestId)
    await mkdir(directory, {recursive: true, mode: 0o700})
    const status = await lstat(directory)
    if (!status.isDirectory() || status.isSymbolicLink())
      throw new Error("Preparation receipts directory must be a real directory")
    return join(await realpath(directory), `${createHash("sha256").update(requestId).digest("hex")}.json`)
  }

  async function stored(requestId: string): Promise<DevelopmentPreparationReceipt | null> {
    const path = await receiptPath(requestId)
    const value = await storedFile(path)
    if (value && value.requestId !== requestId) throw new Error("Preparation receipt request differs")
    return value
  }

  async function storedFile(path: string): Promise<DevelopmentPreparationReceipt | null> {
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW).catch((error) => {
      if (error.code === "ENOENT") return null
      throw error
    })
    if (!file) return null
    try {
      const status = await file.stat()
      if (!status.isFile() || status.size <= 0 || status.size > 8 * 1024 * 1024)
        throw new Error("Preparation receipt size is invalid")
      const value = JSON.parse(await file.readFile("utf8")) as DevelopmentPreparationReceipt
      if (value?.schemaVersion !== 1 || typeof value.requestId !== "string" ||
        !requestIdPattern.test(value.requestId) ||
        basename(path) !== `${createHash("sha256").update(value.requestId).digest("hex")}.json` ||
        value.kind !== "check" && value.kind !== "prepare")
        throw new Error("Preparation receipt is invalid")
      return value
    } finally {await file.close()}
  }

  async function save(receipt: DevelopmentPreparationReceipt) {
    const path = await receiptPath(receipt.requestId)
    const temporary = `${path}.${crypto.randomUUID()}.tmp`
    const file = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
    try {
      await file.writeFile(`${JSON.stringify(receipt)}\n`)
      await file.sync()
    } finally {await file.close()}
    try {
      await rename(temporary, path)
      const handle = await open(directory, constants.O_RDONLY | constants.O_NOFOLLOW)
      try {await handle.sync()} finally {await handle.close()}
    } finally {await rm(temporary, {force: true})}
  }

  async function exclusive<T>(requestId: string, operation: () => Promise<T>): Promise<T> {
    if (closed) throw new Error("Development preparation is closed")
    if (active) throw new Error("Another preparation request is running")
    const task = operation()
    active = task
    activeId = requestId
    try {return await task}
    finally {if (active === task) {active = null; activeId = null}}
  }

  const emit = (listener: Progress | undefined, requestId: string, phase: DevelopmentPreparationProgress["phase"], detail?: string) => {
    try {listener?.({requestId, phase, ...(detail === undefined ? {} : {detail})})} catch {}
  }

  async function check(input: {requestId: string; subject: string}, signal?: AbortSignal, progress?: Progress): Promise<DevelopmentCheckReceipt> {
    requireRequestId(input.requestId)
    await options.authorizeSubject(input.subject)
    const previous = await stored(input.requestId)
    if (previous) {
      if (previous.kind !== "check" || previous.subject !== input.subject ||
        previous.assignmentRevision !== await options.assignmentRevision())
        throw new Error("Preparation request fingerprint differs")
      return previous
    }
    return await exclusive(input.requestId, async () => {
      emit(progress, input.requestId, "checking")
      const assignmentRevision = await options.assignmentRevision()
      const before = await options.builder.sourceInventory()
      let checks: readonly DevelopmentPreparationCheck[] = []
      let error: string | undefined
      try {
        checks = await options.checks(input.subject, signal, value => emit(progress, input.requestId, value.phase, value.detail))
        validateChecks(checks)
      } catch (cause) {error = message(cause)}
      const after = await options.builder.sourceInventory().catch((cause) => {error = message(cause); return null})
      if (!after || after.sha256 !== before.sha256)
        error = "Source inventory changed during checks"
      if (await options.assignmentRevision() !== assignmentRevision)
        error = "Development assignment changed during checks"
      const passed = error === undefined && checks.length > 0 && checks.every((item) => item.passed)
      const receipt: DevelopmentCheckReceipt = {schemaVersion: 1, kind: "check", requestId: input.requestId,
        checkId: input.requestId, subject: input.subject, assignmentRevision,
        inventorySha256: before.sha256, passed, checks,
        ...(error === undefined ? {} : {error})}
      await save(receipt)
      emit(progress, input.requestId, passed ? "checked" : "failed", error)
      return receipt
    })
  }

  async function prepare(input: DevelopmentPreparationRequest, progress?: Progress): Promise<DevelopmentPrepareReceipt> {
    requireRequestId(input.requestId)
    requireRequestId(input.checkId)
    await options.authorizeSubject(input.subject)
    if (!/^[a-f0-9]{64}$/.test(input.expected.digest) || !Number.isSafeInteger(input.expected.revision) || input.expected.revision < 0)
      throw new Error("Invalid expected active selection")
    const previous = await stored(input.requestId)
    if (previous) {
      if (previous.kind !== "prepare" || previous.subject !== input.subject || previous.checkId !== input.checkId ||
        previous.expected.digest !== input.expected.digest || previous.expected.revision !== input.expected.revision ||
        previous.assignmentRevision !== await options.assignmentRevision())
        throw new Error("Preparation request fingerprint differs")
      return previous
    }
    return await exclusive(input.requestId, async () => {
      await requireNoUnknown()
      const checkReceipt = await stored(input.checkId)
      if (!checkReceipt || checkReceipt.kind !== "check" || !checkReceipt.passed || checkReceipt.subject !== input.subject)
        throw new Error("Matching successful source check is missing")
      const assignmentRevision = await options.assignmentRevision()
      if (assignmentRevision !== checkReceipt.assignmentRevision)
        throw new Error("Development assignment changed after check")
      const inventory = await options.builder.sourceInventory()
      if (inventory.sha256 !== checkReceipt.inventorySha256)
        throw new Error("Source inventory changed after check")
      const plan = await options.publication.planPublication(changes)
      await requireActive(input.expected)
      await options.store.verifyCandidate(input.expected.digest)
      const fingerprint = hash({subject: input.subject, checkId: input.checkId,
        expected: input.expected, assignmentRevision, inventorySha256: inventory.sha256, plan})
      let receipt: DevelopmentPrepareReceipt = {schemaVersion: 1, kind: "prepare", requestId: input.requestId,
        subject: input.subject, checkId: input.checkId, expected: input.expected, assignmentRevision,
        inventorySha256: inventory.sha256, fingerprint, plan, state: "running"}
      await save(receipt)
      emit(progress, input.requestId, "publishing")
      let publication: {success: boolean} | undefined
      let failure: string | undefined
      try {
        await options.authorizeSubject(input.subject)
        await requireActive(input.expected)
        if (await options.assignmentRevision() !== assignmentRevision)
          throw new Error("Development assignment changed before publication")
        const result = await options.publication.publishPackages(changes, {expectedPlan: plan,
          provenance: {inventorySha256: inventory.sha256}})
        publication = {success: result.success}
        if (!result.success) failure = publicationFailure(result.results)
      } catch (error) {failure = message(error)}

      let effects: DevelopmentPreparationEffects | undefined
      try {effects = summarizeEffects(await options.publication.readPublicationEffects(plan))}
      catch (error) {failure = [failure, `Effects readback failed: ${message(error)}`].filter(Boolean).join("; ").slice(0, 4096)}
      receipt = {...receipt, ...(publication === undefined ? {} : {publication}),
        ...(effects === undefined ? {} : {effects})}
      await save(receipt)
      if (failure !== undefined || !publication?.success || !effects) {
        receipt = {...receipt, state: effects ? "failed" : "unknown", error: (failure ?? "Publication result is unknown").slice(0, 4096)}
        await save(receipt)
        emit(progress, input.requestId, "failed", receipt.error)
        return receipt
      }

      emit(progress, input.requestId, "published")
      try {
        await options.authorizeSubject(input.subject)
        await requireActive(input.expected)
        if (await options.assignmentRevision() !== assignmentRevision)
          throw new Error("Development assignment changed during preparation")
        emit(progress, input.requestId, "composing")
        const active = await options.store.readActive()
        if (!active || active.digest !== input.expected.digest)
          throw new Error("Active installed release changed during preparation")
        const published = await createPublishedReleaseSource(options.publication)
        const graph = compose(active.graph, published.graph, plan)
        const source: ReleaseArtifactSource = {read: async (identity) => changedNames.has(identity.name)
          ? published.artifacts.read(identity)
          : Bun.file(await options.store.artifactPath(active.digest, identity)).stream()}
        const activeLine = await readInstalledStateCompatibility(options.store, active.digest)
        const targetLine = await options.compatibility(graph, source)
        if (!activeLine || !targetLine || activeLine !== targetLine)
          throw new Error("Prepared release persisted-state compatibility differs")
        await requireActive(input.expected)
        const target = {digest: publishedReleaseGraphDigest(graph), compatibilityLine: targetLine}
        receipt = {...receipt, target}
        await save(receipt)
        emit(progress, input.requestId, "installing")
        const candidate = await options.store.prepare(graph, source, target.digest)
        receipt = {...receipt, candidate: {digest: candidate.digest, compatibilityLine: targetLine}}
        await save(receipt)
        await requireActive(input.expected)
        receipt = {...receipt, state: "complete"}
        await save(receipt)
        emit(progress, input.requestId, "complete")
      } catch (error) {
        receipt = {...receipt, state: "failed", error: message(error)}
        await save(receipt)
        emit(progress, input.requestId, "failed", receipt.error)
      }
      return receipt
    })
  }

  async function requireActive(expected: DevelopmentPreparationRequest["expected"]) {
    const current = await options.store.readActivation()
    if ((current?.digest ?? null) !== expected.digest || (current?.revision ?? 0) !== expected.revision)
      throw new Error("Installed activation changed during preparation")
  }

  async function requireNoUnknown() {
    const entries = await readdir(directory).catch((error) => {
      if (error.code === "ENOENT") return []
      throw error
    })
    if (entries.length > 2048) throw new Error("Preparation receipt inventory is too large")
    for (const name of entries) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) continue
      const value = await storedFile(join(directory, name))
      if (!value) throw new Error("Preparation receipt disappeared during inventory")
      if (value.kind === "prepare" &&
        (value.state === "running" || value.state === "unknown" && !value.operatorReadback))
        throw new Error(`Preparation outcome requires operator readback: ${value.requestId}`)
    }
  }

  async function read(requestId: string, expectedSubject?: string): Promise<DevelopmentPreparationReceipt | null> {
    const receipt = await stored(requestId)
    if (receipt && expectedSubject !== undefined && receipt.subject !== expectedSubject)
      throw new Error("Preparation receipt belongs to another subject")
    if (receipt) await options.authorizeSubject(receipt.subject)
    if (!receipt || receipt.kind !== "prepare" || activeId === requestId ||
      receipt.state !== "running" && !(receipt.state === "unknown" && !receipt.operatorReadback))
      return receipt
    let effects: DevelopmentPreparationEffects | undefined
    let error: string | undefined
    try {effects = summarizeEffects(await options.publication.readPublicationEffects(receipt.plan))}
    catch (cause) {error = `Effects readback failed: ${message(cause)}`}
    let candidate = receipt.candidate
    if (receipt.target && !candidate) {
      const ready = await options.store.verifyCandidate(receipt.target.digest).catch(() => null)
      if (ready) candidate = receipt.target
    }
    const unknown: DevelopmentPrepareReceipt = {...receipt, state: "unknown", operatorReadback: true,
      ...(effects === undefined ? {} : {effects}),
      ...(candidate === undefined ? {} : {candidate}),
      ...(error === undefined ? {} : {error})}
    await save(unknown)
    return unknown
  }

  async function close() {
    closed = true
    await active?.catch(() => {})
  }

  return {check, prepare, read, close}

}

function summarizeEffects(value: ReleasePublicationEffects): DevelopmentPreparationEffects {
  return {
    root: {manifestSha256: value.root.manifestSha256, matchesPlan: value.root.matchesPlan},
    packages: value.packages.map((item) => ({name: item.name, version: item.version,
      childVersion: item.childVersion, ready: item.ready,
      prepared: item.prepared.map((part) => ({env: part.env, outputsCount: part.outputs.length,
        inventorySha256: part.provenance?.inventorySha256 ?? null}))})),
  }
}

function compose(active: PublishedReleaseGraph, published: PublishedReleaseGraph, plan: ReleasePublicationPlan) {
  if (plan.packages.length !== 2 || !plan.packages.every(({name}) => changedNames.has(name)))
    throw new Error("Preparation plan must change Core and Visual together")
  const replacements = new Map(published.packages.filter(({name}) => changedNames.has(name)).map((item) => [item.name, item]))
  for (const target of plan.packages) {
    if (replacements.get(target.name)?.version !== target.version)
      throw new Error(`Published package differs from preparation plan: ${target.name}`)
    if (!active.packages.some(({name}) => name === target.name))
      throw new Error(`Active release lacks required package: ${target.name}`)
  }
  const packages = active.packages.map((item) => replacements.get(item.name) ?? item)
  const graph = validatePublishedReleaseGraph({schemaVersion: 1, packages})
  for (const old of active.packages) {
    if (changedNames.has(old.name)) continue
    const retained = graph.packages.find(({name}) => name === old.name)
    if (JSON.stringify(retained) !== JSON.stringify(old))
      throw new Error(`Retained package bytes changed: ${old.name}`)
  }
  return graph
}

function requireRequestId(value: string) {
  if (!requestIdPattern.test(value)) throw new Error("Invalid preparation request ID")
}

function validateChecks(checks: readonly DevelopmentPreparationCheck[]) {
  if (!Array.isArray(checks) || checks.length === 0 || checks.length > 64 || checks.some((item) =>
    !item || typeof item.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(item.id) ||
    typeof item.passed !== "boolean" || typeof item.detail !== "string" || item.detail.length > 2000))
    throw new Error("Invalid development check result")
  if (new Set(checks.map(({id}) => id)).size !== checks.length)
    throw new Error("Duplicate development check result")
}

function message(error: unknown) {
  return (error instanceof Error ? error.message : String(error))
    .replace(/(?<![A-Za-z0-9])\/(?:[^\s'"()]+\/)*[^\s'"()]+/g, "[path]")
    .slice(0, 2000)
}

function publicationFailure(results: readonly {module: string; env: string; stage?: string; stdout: string; stderr: string; success: boolean}[]) {
  const details = results.filter(item => !item.success).map(item => {
    const diagnostics = [item.stderr, item.stdout].filter(Boolean).join("\n").slice(-700)
    return `${item.module}:${item.env} ${item.stage ?? "build"} failed${diagnostics ? `\n${diagnostics}` : ""}`
  })
  return (details.join("\n") || "Publication failed").slice(0, 4096)
}

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}
