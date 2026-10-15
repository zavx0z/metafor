import type {StorybookChatSession} from "@zavx0z/storybook-chat-session"
/**
Доверенная исходная область Cosmos. Manifests задают состав; каталоги,
права записи и machine capability приходят только от хоста, не от модели.
Пакет без подтверждённого Archetype остаётся обычным Package.
*/
export const DEVELOPMENT_SCHEMA = "cosmos:development/v1" as const
export type DevelopmentDependencyKind = "dependencies" | "devDependencies" | "peerDependencies" | "optionalDependencies"
export type DevelopmentPackage = Readonly<{
  name: string
  label: string
  address: string
  owner: string | null
  /** Ближайший физический package-предок; owner сохраняет назначенный корень прав. */
  ownerName?: string | null
  resolution: "source" | "external"
  writable: boolean
}>
/** Нормализованная структура public Storybook graph; sourcePath относителен своему package. */
export type DevelopmentSourceNode = Readonly<{
  id: string
  kind: "package" | "directory" | "entry"
  packageName: string
  label: string
  parentId: string | null
  childIds: readonly string[]
  routePath: string
  sourcePath: string
  entryConditions?: readonly (readonly string[])[]
}>
export type DevelopmentDependency = Readonly<{from: string, to: string, kind: DevelopmentDependencyKind, range: string}>
export type DevelopmentCatalog = Readonly<{
  schema: typeof DEVELOPMENT_SCHEMA
  workspaceId: string
  rootPackage: string
  revision: string
  packages: readonly DevelopmentPackage[]
  dependencies: readonly DevelopmentDependency[]
  /** Старые clients могут не получать структуру; новый каталог всегда её публикует. */
  nodes?: readonly DevelopmentSourceNode[]
}>

/** Содержание выбранного физического узла; наличие сценария не выдаёт разрешение его исполнения. */
export type DevelopmentContent = Readonly<{
  packageName: string
  node: DevelopmentSourceNode
  revision: string
  /** Local same-origin media adapter; base каталога исходного TSDoc, без credentials. */
  resourceBase: string
  overview: Readonly<{label: string, description?: string}>
  documentation: Readonly<{sourcePath: string, sourceDigest: string, markdown: string}> | null
  entries: readonly Readonly<{path: string, target: string | null, conditions: readonly string[], status: string,
    input: string | null, output: string | null}>[]
  contracts: readonly Readonly<{path: string, content: string, hash: string}>[]
  /** Объявленные manifest связи; не результаты deps.spec и не пространственная вложенность. */
  dependencies?: readonly Readonly<{name: string, kind: DevelopmentDependencyKind, range: string}>[]
  scenarios: Readonly<{sourcePaths: readonly string[], executable: false, reason: string}>
}>
/** Назначение хоста: разрешённая зависимость не получает право записи автоматически. */
export type DevelopmentWorkspaceAssignment = Readonly<{
  id: string
  rootPackage: string
  roots: readonly Readonly<{name: string, directory: string, writable: boolean}>[]
  stateDirectory: string
}>

export const DEVELOPMENT_PATH = "/cosmos/development" as const
export type DevelopmentExecution = Readonly<{
  connections: Awaited<ReturnType<NonNullable<StorybookChatSession.Input["resolveExecution"]>>>["connections"]
  connectionId: string
  approvalMode?: "ask" | "scoped-autonomous"
}>
export type DevelopmentConfiguration = DevelopmentWorkspaceAssignment & Readonly<{
  version: 1
  execution: DevelopmentExecution
  machine?: Readonly<{enabled: boolean, hostId: string, revision: string}>
}>

export type DevelopmentChatScope = Readonly<{address: string, executorId?: string, sessionId?: string}>
export type DevelopmentSubscription = (scope: DevelopmentChatScope, listener: (snapshot: unknown) => void) => Promise<() => void>
export type DevelopmentObserver = (scope: DevelopmentChatScope, listener: (snapshot: unknown) => void, onError: (error: Error) => void) => () => void
