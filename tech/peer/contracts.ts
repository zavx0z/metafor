/** Непрозрачный адрес назначает consumer; поколение RTC-связи создаёт peer. */
export type PeerId = string

/** ICE credentials передаются adapter и никогда не публикуются в snapshot. */
export interface IceServer {
  urls: string | string[]
  username?: string
  credential?: string
}

/** Полное SDP после ICE gathering; bootstrap и существующий peer используют один DTO. */
export interface PeerDescription {
  type: "offer" | "answer"
  sdp: string
}

/** Внешний bootstrap связывает from с авторизованной сессией; via назначает peer relay. */
export interface PeerSignal {
  from: PeerId
  to: PeerId
  generation: string
  description: PeerDescription
  via?: PeerId
}

/** Авторизованный bootstrap принадлежит caller. Потеря bootstrap не закрывает RTC. */
export interface SignalTransport {
  send(signal: PeerSignal): void
  subscribe(listener: (signal: PeerSignal) => void): () => void
  peers(): readonly PeerId[]
  subscribePeers(listener: (peers: readonly PeerId[]) => void): () => void
  readonly open: boolean
  close(): void
}

/** Один надёжный ordered канал. Factory передаёт его lifecycle владельцу PeerNetwork. */
export interface PeerDataChannel {
  /** Native label; older single-channel factories may omit it. */
  readonly label?: string
  readonly readyState: string
  readonly bufferedAmount: number
  send(bytes: Uint8Array): void
  subscribe(handlers: {
    message(bytes: Uint8Array): void
    open(): void
    close(): void
    error(reason: unknown): void
  }): () => void
  close(): void
}

/** Общая RTC-граница; setLocalDescription завершается после ICE gathering. */
export interface PeerConnection {
  readonly localDescription: PeerDescription | undefined
  createOffer(): Promise<PeerDescription>
  createAnswer(): Promise<PeerDescription>
  setLocalDescription(description: PeerDescription): Promise<void>
  setRemoteDescription(description: PeerDescription): Promise<void>
  createDataChannel(label: string): PeerDataChannel
  onDataChannel(listener: (channel: PeerDataChannel) => void): () => void
  onState(listener: (state: string) => void): () => void
  close(): Promise<void>
}

/** Factory создаёт отдельный RTC endpoint на каждое поколение одной связи. */
export type PeerConnectionFactory = (options: {iceServers: readonly IceServer[]}) => PeerConnection

/** Публичное наблюдение связей без SDP, credentials и payload. channels reports native DC readiness, even while relay is available. */
export interface PeerSnapshot {
  id: PeerId
  peers: PeerId[]
  bootstrap: boolean
  links: {peerId: PeerId, generation: string, state: "connecting" | "open", transport?: "direct" | "relay", via?: PeerId,
    channels?: {name: string, state: "connecting" | "open"}[]}[]
}

/** Прикладная доставка; peerId обозначает непосредственного RTC-соседа. */
export interface PeerData {
  peerId: PeerId
  data: Uint8Array | string
  /** Прикладная линия: 1..128 ASCII letters/digits или _.:-; default app. */
  channel: string
  /** Selected physical lane when named dataChannels were explicitly configured. */
  physicalChannel?: string
}

/** Лимиты очередей применяются независимо к каждой physical lane; maximum payload задаётся bounded maxMessageBytes. */
export interface PeerNetworkOptions {
  id: PeerId
  rtc: PeerConnectionFactory
  bootstrap?: SignalTransport
  iceServers?: readonly IceServer[]
  timeoutMs?: number
  maxPeers?: number
  maxQueuedBytes?: number
  /** Default 16 MiB; explicit bounded capacity up to 32 MiB for Oracle adapters. */
  maxMessageBytes?: number
  /**
  One PC creates exactly these reliable ordered DCs (1..16 unique service names).
  Both endpoints configure the same names; omission retains one legacy DC and
  the original event shape. Omitted send physicalChannel selects the first name.
  [Native channels and backpressure](spec/channels.spec.ts) verify isolation.
  */
  dataChannels?: readonly string[]
}

/** Routed admission uses signaling; the first application send awaits a bounded real RTC attempt. */
export interface RoutedPeerNetworkOptions extends PeerNetworkOptions {
  bootstrap: RelaySignalTransport
  /** Default min(15 seconds, timeoutMs); timed-out RTC can still open later. */
  directTimeoutMs?: number
}

/**
Владеет прямыми RTC-связями и introductions через выбранного соседа.
createPeerNetwork.connect завершается после открытия всех configured ordered DCs; send — после передачи
локальному RTC, без прикладного acknowledgement. Одновременные запросы ещё не
открытой связи принимают выбранное предложение; этот выбор не повторяет
прикладные отправки. Закрытие освобождает timers,
очереди, подписки и owned endpoints. Закон: [связи участников](README.md).
Реальный RTC-сценарий: [три участника](spec/network.spec.ts).
*/
export interface PeerNetwork {
  readonly id: PeerId
  /** Effective payload capacity; absent on older injected test transports. */
  readonly maxMessageBytes?: number
  connect(peerId: PeerId, options?: {via?: PeerId}): Promise<void>
  send(peerId: PeerId, data: Uint8Array | string, options?: {channel?: string, physicalChannel?: string}): Promise<void>
  onData(listener: (event: PeerData) => void): () => void
  subscribe(listener: (snapshot: PeerSnapshot) => void): () => void
  snapshot(): PeerSnapshot
  disconnect(peerId: PeerId): Promise<void>
  closeBootstrap(): void
  close(): Promise<void>
}

/** Авторизованный relay доставляет только bounded frames между admitted peers.
Origin назначает rendezvous по сессии, а не по payload. Relay требует отдельного
opt-in host и обоих клиентов. Законы: [связи участников](README.md).
*/
export interface RelaySignalTransport extends SignalTransport {
  readonly relayEnabled: boolean
  sendRelay(to: PeerId, frame: string, channel?: string): Promise<void>
  subscribeRelayClose(listener: (event: {peerId: PeerId, channel: string}) => void): () => void
  /** channel is assigned by the admitted data socket, never trusted from its payload. */
  subscribeRelay(listener: (event: {from: PeerId, frame: string, channel?: string}) => void): () => void
}
