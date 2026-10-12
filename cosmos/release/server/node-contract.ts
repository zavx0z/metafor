import type {ReleaseParticipant as Peer} from "./participant/contract"
import type {ReleasePeer, ReleasePeerSource} from "./peer"
import type {ReleaseNodeObservationSource} from "./peer-observation"
import type {PeerNetworkObservation} from "../shared/peer-observation"

/** Физическая сеть и native policy принадлежат release; package-name sources проверяет root Quantum caller отдельно. */
export interface ReleaseNodeConfiguration extends Peer.Configuration {
  sources?: readonly string[]
}

/** Source раздаёт только уже проверенный pinned graph/artifacts и не назначает выпуск. */
export interface ReleaseNodeOptions {
  config: ReleaseNodeConfiguration
  source: ReleasePeerSource
  /** Необязательная локальная capability наблюдения; отчёт не открывает прикладной admission. */
  observation?: ReleaseNodeObservationSource
}

export type ReleaseNodeDependencies = Peer.Slots

/** Artifact adapters текущих поколений используют единственную сеть release. */
export interface ReleaseNode {
  readonly id: string
  readonly network: Peer.Output["network"]
  peer(peerId: string): Promise<ReleasePeer>
  snapshot(): ReturnType<Peer.Output["snapshot"]>
  /** Кэш авторизованных наблюдений; отчёт отключённого или устаревшего соседа равен null. */
  observe(): PeerNetworkObservation
  /** Запрашивает ограниченный свежий отчёт без изменения мира или прикладного состояния. */
  refreshObservation(): Promise<void>
  /** Caller закрывает admission отдельно; принятые release transfers и retired source cleanup завершаются без закрытия сети. */
  whenIdle(): Promise<void>
  close(): Promise<void>
}
