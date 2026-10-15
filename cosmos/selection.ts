import {createInstalledReleaseStore, isReleaseDigest, type InstalledReleaseExpectation} from "@metafor/tech-release/installed"
import {realpath} from "node:fs/promises"
import {isAbsolute} from "node:path"
import {createHash} from "node:crypto"

type Store = ReturnType<typeof createInstalledReleaseStore>

/**
Opaque identity точного local store для CLI→HTTP owner binding; не capability и
не host path в browser state. CLI проверяет её до POST, а HTTP owner повторяет
проверку до эффекта. Два одинаковых выпуска в разных stores проверяются в
`release/spec/downgrade.spec.ts`.
*/
export async function installedReleaseStoreIdentity(root: string): Promise<string> {
  return createHash("sha256").update(await realpath(root)).digest("hex")
}

/**
Явное решение оператора после read-only подготовки. Startup повторяет CAS и
проверку bytes под своим launcher lock. Применение не меняет instance paths.
Контракт одинаков для CLI и будущей HUD-проекции, которая сама startup не владеет.
Сценарии: `release/spec/downgrade.spec.ts`.
*/
export type InstalledReleaseSelection = Readonly<{
  kind: "activate" | "downgrade"
  storeRoot: string
  target: string
  expected: InstalledReleaseExpectation
}>

/** Строгий parser одноразового намерения; transport не выдаёт authority сам по себе. */
export function parseInstalledReleaseSelection(value: unknown): InstalledReleaseSelection {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid installed release selection")
  const input = value as Record<string, unknown>
  const expected = input.expected as Record<string, unknown> | null
  if (Object.keys(input).sort().join() !== "expected,kind,storeRoot,target" ||
    typeof input.storeRoot !== "string" || !isAbsolute(input.storeRoot) || input.storeRoot.length > 4096 || /[\u0000-\u001f]/.test(input.storeRoot) ||
    input.kind !== "activate" && input.kind !== "downgrade" || !isReleaseDigest(input.target) ||
    !expected || typeof expected !== "object" || Array.isArray(expected) || Object.keys(expected).sort().join() !== "digest,revision" ||
    expected.digest !== null && !isReleaseDigest(expected.digest) || !Number.isSafeInteger(expected.revision) || Number(expected.revision) < 0)
    throw new Error("Invalid installed release selection")
  return {kind: input.kind, storeRoot: input.storeRoot, target: input.target, expected: {digest: expected.digest as string | null, revision: Number(expected.revision)}}
}

/** Ограниченный opaque transport через аргумент штатного terminal runner, без записи ENV-файла. */
export function decodeInstalledReleaseSelection(value: string): InstalledReleaseSelection {
  if (value.length > 8192 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid installed release selection encoding")
  const bytes = Buffer.from(value, "base64url")
  if (bytes.toString("base64url") !== value) throw new Error("Invalid installed release selection encoding")
  return parseInstalledReleaseSelection(JSON.parse(bytes.toString()))
}

/**
Читает verified public artifact владельца сохранённых форматов без исполнения
candidate. Legacy отсутствие возвращает null только для обычного запуска;
malformed или неизвестный contract отклоняется. Линия охватывает только
состояние, описанное [владельцем Release](./release/README.md#возврат-предыдущего-выпуска).
*/
export async function readInstalledStateCompatibility(store: Store, digest: string): Promise<string | null> {
  const candidate = await store.readCandidate(digest)
  if (!candidate) throw new Error("Installed release candidate is not ready")
  const member = candidate.graph.packages.find(item => item.name === "@cosmos/release")
  const part = member?.environments.find(item => item.env === "server")
  const output = part?.outputs.find(item => item.artifact === "./persisted-state.json" && item.kind !== "sourcemap")
  if (!output) return null
  if (!member || output.size > 1024 || output.kind !== "asset" && output.kind !== "copy")
    throw new Error("Invalid installed persisted-state contract")
  const path = await store.artifactPath(digest, {name: member.name, version: member.version, env: "server", ...output})
  const value: unknown = await Bun.file(path).json()
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid installed persisted-state contract")
  const input = value as Record<string, unknown>
  if (Object.keys(input).sort().join() !== "compatibilityLine,version" || input.version !== 1 ||
    typeof input.compatibilityLine !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,179}$/.test(input.compatibilityLine))
    throw new Error("Unsupported installed persisted-state contract")
  return input.compatibilityLine
}

/** Готовит явную активацию готового digest либо ровно предыдущий successful выпуск. */
export async function prepareInstalledReleaseSelection(
  storeRoot: string,
  request: Readonly<{kind: "downgrade"}> | Readonly<{kind: "activate"; target: string}>,
): Promise<InstalledReleaseSelection> {
  const store = createInstalledReleaseStore({root: storeRoot})
  const current = await store.readActivation()
  const target = request.kind === "activate" ? request.target : current?.successful.find(item => item.digest !== current.digest)?.digest
  if (!target) throw new Error("No previous successfully admitted release is recorded")
  const selection = parseInstalledReleaseSelection({kind: request.kind, target, storeRoot: await realpath(storeRoot),
    expected: {digest: current?.digest ?? null, revision: current?.revision ?? 0}})
  await verifyInstalledReleaseSelection(storeRoot, selection)
  return selection
}

/** Повторяет preflight без mutations; caller startup удерживает exclusive lock перед запуском. */
export async function verifyInstalledReleaseSelection(storeRoot: string, value: InstalledReleaseSelection, options: {compatible?: boolean} = {}): Promise<void> {
  const selection = parseInstalledReleaseSelection(value)
  if (await realpath(storeRoot) !== selection.storeRoot) throw new Error("Installed selection belongs to another store")
  const store = createInstalledReleaseStore({root: storeRoot})
  const current = await store.readActivation()
  if ((current?.digest ?? null) !== selection.expected.digest || (current?.revision ?? 0) !== selection.expected.revision)
    throw new Error("Installed activation changed; read the current release before retrying")
  const targetCandidate = await store.verifyCandidate(selection.target)
  const historical = current?.successful.find(item => item.digest === selection.target)
  const currentCandidate = current ? await store.readCandidate(current.digest) : null
  const returnsPackageVersion = targetCandidate.graph.packages.some(member => {
    const prior = currentCandidate?.graph.packages.find(item => item.name === member.name)
    if (!prior) return false
    const target = member.version.split(".").map(Number)
    const active = prior.version.split(".").map(Number)
    return (target[0]! - active[0]! || target[1]! - active[1]! || target[2]! - active[2]!) < 0
  })
  if (selection.kind === "activate") {
    if (current?.digest === selection.target) throw new Error("Installed release is already selected; use restart")
    // Явная первая установка нового состава остаётся installer-путём. Возврат
    // уже исполнявшегося digest не получает обход format gate через activate.
    if (!options.compatible && !historical && !returnsPackageVersion) return
  }
  if (!current) throw new Error("Compatible selection requires a current installed release")
  const previous = current.successful.find(item => item.digest !== current.digest)
  if (selection.kind === "downgrade" && (!previous || previous.digest !== selection.target)) throw new Error("Downgrade target is not the previous successful release")
  await store.verifyCandidate(current.digest)
  const [activeLine, targetLine] = await Promise.all([
    readInstalledStateCompatibility(store, current.digest), readInstalledStateCompatibility(store, selection.target),
  ])
  if (!activeLine || !targetLine || selection.kind === "downgrade" && previous?.compatibility !== targetLine ||
    historical && historical.compatibility !== targetLine || targetLine !== activeLine)
    throw new Error("Downgrade persisted-state compatibility is unknown or differs")
}
