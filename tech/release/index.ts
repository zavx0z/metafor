import {join} from "node:path"
import type {ReleaseFileOperations} from "./contracts"
import type {PackageBuilder} from "@metafor/tech-build"
import {createReleaseComposition} from "./composition"
import {createPublicationQueue} from "./queue"
import {createArtifactProjection} from "./desired"
import {createReleaseState} from "./state"
import {createReleaseStorage} from "./storage"
import {createPublication} from "./publication"

export interface ReleaseOptions {
  root: string
  builder: PackageBuilder
  /** Принадлежность зависимости составу выпуска задаёт приложение. */
  isMember(name: string): boolean
  /** Файловые операции хоста; по умолчанию используются системные. */
  io?: ReleaseFileOperations
}

/**
Создаёт независимый механизм [выпуска](./README.md) для корня потребителя.

`publishPackages` принимает группу изменений patch/minor/major, сохраняет root
intent перед подготовкой и фиксирует child versions после всех outputs.
`recoverPublication` продолжает сохранённую цель либо подготавливает первый
состав. `releasedPackages` ожидает очередь и читает подтверждённые версии.

Внутренние подтверждения и копии байтов находятся в `.release/` корня. Ready
связывает hashes всех environment receipts; повреждение подтверждения вызывает
ошибку до компилятора. Существующий граф старого физического формата принимается
по сохранённым байтам и import edges без сборки текущих исходников. HTTP, RPC,
Cache Storage и активация runtime остаются у потребителя.

@param options - Корень, экземпляр сборщика, политика принадлежности пакетов
  выпуску и необязательный адаптер файловых операций с системной семантикой.
@returns Экземпляр с собственной очередью, projection и операциями выпуска.
@throws При ошибках деклараций, несовместимости, неполноте подтверждения или
  конфликте immutable bytes соответствующая операция отклоняется; обычная
  неудача новой публикации восстанавливает прежние manifests.

Сценарии: [выпуск](./spec/scenario.spec.ts),
[продолжение](./spec/recovery.spec.ts), [отказы](./spec/failures.spec.ts).
*/
export function createRelease(options: ReleaseOptions) {
  const context = {...options, manifest: join(options.root, "package.json")}
  const storage = createReleaseStorage(options.root, options.io)
  const composition = createReleaseComposition(context, storage)
  const queue = createPublicationQueue()
  const projection = createArtifactProjection()
  const state = createReleaseState(composition, queue)
  const publication = createPublication(context, composition, queue, projection, state, storage)
  return {...composition, ...queue, ...projection, ...state, ...publication}
}

export * from "./contracts"
export {
  validateReleaseDependencyGraph,
  validateBrowserReleaseEnvironments,
  validateTargetReleaseVersions,
  satisfiesWorkspaceRange,
} from "./composition"
export type {ReleaseCompositionMember, ReleaseDependencyMember} from "./composition"
export {publishImmutableArtifact, writeRootVersions, restoreManifest} from "./publication"
export type {RecoveryResult} from "./publication"
export * from "./artifact-path"
export * from "./version"
