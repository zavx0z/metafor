import {createHash} from "node:crypto"
import {dirname, join} from "node:path"
import {isDeepStrictEqual} from "node:util"
import {createPackageBuilder} from "@metafor/tech-build"
import {createRelease} from "@metafor/tech-release"
import {createInstalledReleaseStore, type PublishedReleaseGraph, type ReleaseArtifactSource} from "@metafor/tech-release/installed"
import {parseInstalledStateCompatibility} from "../../selection"
import {readDevelopmentConfiguration} from "./development-config"
import {createDevelopmentPreparation} from "./development-prepare"
import type {DevelopmentConfiguration} from "../shared/development"
import type {ReleaseManagementSnapshot} from "../shared/management"
import type {createDevelopmentCatalog} from "./development-catalog"
import type {DevelopmentTool} from "./development-environment"

type Catalog = Awaited<ReturnType<typeof createDevelopmentCatalog>>
export type DevelopmentReleaseHost = Readonly<{
  storeRoot: string
  adapterEntrypoint(): Promise<string>
  scenarioPreloadEntrypoint(): Promise<string>
  readStatus(): Promise<ReleaseManagementSnapshot>
}>

/** Installed owner предоставляет store и проверенный adapter; source scope задаёт private назначение хоста. */
export function createAssignedPreparation(config: DevelopmentConfiguration, catalog: Catalog, host: DevelopmentReleaseHost,
  environment: Readonly<Record<string, string | undefined>>) {
  const assignment = config.preparation
  if (!assignment?.enabled) return null
  const lifetime = new AbortController()
  const validateAssignment = async () => {
    if (!isDeepStrictEqual(await readDevelopmentConfiguration(environment), config))
      throw new Error("Назначение разработки изменилось; повторно откройте окружение")
    return assignment.revision
  }
  const group = ["@cosmos/release", "@internal/visual"]
  const builder = createPackageBuilder({
    profile: "production",
    signal: lifetime.signal,
    adapterEntrypoint: host.adapterEntrypoint,
    resolvePackage: async name => catalog.source(name).directory,
    provenance: {
      roots: assignment.inputRoots,
      excludedDirectoryNames: [".git", ".local", ".metafor", ".release", "node_modules", "dist", "coverage", ".cache",
        ".capsule", ".chrome-studio", "tmp", "production", "Concept", ".DS_Store"],
      excludedDirectoryNamePrefixes: [".package-update-", ".package-recovery-", ".compiled-"],
    },
    async preparedDependencies(owner) {
      if (owner.env !== "main" || owner.root !== catalog.source("@internal/visual").directory) return []
      const path = Bun.resolveSync("@zavx0z/immersive/browser.json", owner.root)
      const inventory = await Bun.file(path).json()
      if (inventory.schemaVersion !== 1 || inventory.name !== "@zavx0z/immersive") throw new Error("Invalid prepared browser dependency")
      return [{...inventory, root: dirname(path)}]
    },
  })
  let queue: Promise<unknown> = Promise.resolve()
  const sequentialBuilder = {...builder, buildPackage(...args: Parameters<typeof builder.buildPackage>) {
    const pending = queue.then(() => builder.buildPackage(...args))
    queue = pending.catch(() => {})
    return pending
  }}
  const publication = createRelease({root: catalog.source("@metafor/cosmos").directory, builder: sequentialBuilder,
    isMember: name => name === "@cosmos/startup" || name === "@cosmos/release" || name.startsWith("@internal/")})
  const service = createDevelopmentPreparation({
    publication,
    builder,
    store: createInstalledReleaseStore({root: host.storeRoot}),
    receiptsDirectory: join(config.stateDirectory, "preparations"),
    async authorizeSubject(subject) {
      await validateAssignment()
      if (!catalog.subject(subject).writable) throw new Error("Подготовка выпуска не назначена этому пакету")
    },
    assignmentRevision: validateAssignment,
    async checks(_subject, signal, progress) {
      const results = []
      for (const name of group) {
        signal?.throwIfAborted()
        progress({requestId: "", phase: "checking", detail: `${name}: typecheck`})
        const {exitCode, stdout, stderr} = await builder.checkPackage(name, {
          signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(180_000)]),
        })
        results.push({id: name === "@cosmos/release" ? "core:typecheck" : "visual:typecheck", passed: exitCode === 0,
          detail: `${name}: exitCode=${exitCode}\n${[stdout, stderr].filter(Boolean).join("\n").slice(-1900)}`})
        if (exitCode !== 0) break
      }
      return results
    },
    compatibility: readPreparationCompatibility,
  })
  return {...service, close() {
    lifetime.abort(new DOMException("Source preparation closed", "AbortError"))
    return service.close()
  }}
}

/** Читает инертный контракт кандидата до installed prepare, сверяя точные bytes. */
async function readPreparationCompatibility(graph: PublishedReleaseGraph, source: ReleaseArtifactSource) {
  const member = graph.packages.find(item => item.name === "@cosmos/release")
  const output = member?.environments.find(part => part.env === "server")?.outputs.find(item => item.artifact === "./persisted-state.json")
  if (!member || !output || output.size > 1024 || !["asset", "copy"].includes(output.kind)) throw new Error("Нет проверенного контракта сохранённых данных")
  const value = await source.read({name: member.name, version: member.version, env: "server", ...output})
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of value instanceof Uint8Array ? [value] : value) {
    size += chunk.byteLength
    if (size > 1024) throw new Error("Контракт сохранённых данных превышает предел")
    chunks.push(chunk)
  }
  const bytes = Buffer.concat(chunks)
  if (bytes.length !== output.size || createHash("sha256").update(bytes).digest("hex") !== output.sha256) throw new Error("Байты контракта сохранённых данных изменились")
  return parseInstalledStateCompatibility(JSON.parse(bytes.toString("utf8")))
}

type Preparation = NonNullable<ReturnType<typeof createAssignedPreparation>>
const object = (input: unknown): input is Record<string, unknown> => input !== null && typeof input === "object" && !Array.isArray(input)
const idSchema = {type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$"}

/** Subject и полномочия замкнуты хостом; модель не выбирает store, пути или группу выпуска. */
export function developmentReleaseTools(host: DevelopmentReleaseHost, preparation: Preparation | null, subject: string): DevelopmentTool[] {
  const tools: DevelopmentTool[] = [{name: "cosmos.release.status", title: "Состояние выпуска", description: "Текущий выпуск, revision и подготовленные кандидаты. Ничего не устанавливает.",
    inputSchema: {type: "object", properties: {}, additionalProperties: false}, outputSchema: {type: "object"},
    annotations: {readOnlyHint: true, destructiveHint: false}, async execute(input) {
      if (!object(input) || Object.keys(input).length) throw new Error("Ожидались пустые аргументы")
      const snapshot = await host.readStatus()
      const candidates = snapshot.candidates.filter(candidate => candidate.active || candidate.previousSuccessful || candidate.activate.allowed)
      return {...snapshot, candidates, archivedCount: snapshot.candidates.length - candidates.length}
    }}]
  if (!preparation) return tools
  tools.push({name: "cosmos.check", title: "Проверить исходники выпуска", description: "Проверяет назначенные Core/Visual и сохраняет checkId с отпечатком исходников. Выпуск не публикует. После изменения исходников требуется новая проверка.",
    inputSchema: {type: "object", required: ["requestId"], properties: {requestId: idSchema}, additionalProperties: false}, outputSchema: {type: "object"},
    annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true}, execute(input, context) {
      if (!object(input) || Object.keys(input).join() !== "requestId" || typeof input.requestId !== "string") throw new Error("Нужен requestId проверки")
      return preparation.check({requestId: input.requestId, subject}, context?.signal, event => {void context?.onProgress?.({...event})})
    }}, {name: "cosmos.prepare", title: "Подготовить выпуск", description: "Публикует patch Core/Visual по прошедшему cosmos.check и сохраняет совместимый кандидат. Публикация меняет версии и сохраняет артефакты даже при некоторых отказах; смотри effects. Активный выпуск и Meta не меняет. Активация выполняется отдельно в Настройках → Сборки и откат. После неизвестного результата сначала cosmos.preparation.read с прежним requestId.",
    inputSchema: {type: "object", required: ["requestId", "checkId", "expected"], additionalProperties: false, properties: {
      requestId: idSchema, checkId: idSchema, expected: {type: "object", required: ["digest", "revision"], additionalProperties: false,
        properties: {digest: {type: "string", pattern: "^[a-f0-9]{64}$"}, revision: {type: "integer", minimum: 0}}},
    }}, outputSchema: {type: "object"}, annotations: {readOnlyHint: false, destructiveHint: true, idempotentHint: true}, execute(input, context) {
      if (!object(input) || Object.keys(input).sort().join() !== "checkId,expected,requestId") throw new Error("Неверное намерение подготовки")
      context?.signal.throwIfAborted()
      return preparation.prepare({...input, subject} as Parameters<Preparation["prepare"]>[0], event => {void context?.onProgress?.({...event})})
    }}, {name: "cosmos.preparation.read", title: "Результат подготовки", description: "Читает сохранённую квитанцию проверки или подготовки. Не повторяет сборку, публикацию или установку.",
    inputSchema: {type: "object", required: ["requestId"], additionalProperties: false, properties: {requestId: idSchema}}, outputSchema: {type: "object"},
    annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true}, execute(input) {
      if (!object(input) || Object.keys(input).join() !== "requestId" || typeof input.requestId !== "string") throw new Error("Нужен requestId")
      return preparation.read(input.requestId, subject)
    }})
  return tools
}
