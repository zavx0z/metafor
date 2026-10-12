import type {
  InstalledArtifactIdentity,
  PublishedReleaseGraph,
  ReleaseArtifactSource,
} from "@metafor/tech-release/installed"

/**
Один уже открытый надёжный ordered DataChannel. Его подключением и закрытием
владеет вызывающий runtime; transport освобождает только свои подписки и запросы.
Размер ограничивает полное сообщение, включая framing.
*/
export interface ReleaseDataChannelPort {
  readonly readyState: string
  readonly bufferedAmount: number
  readonly maxMessageSize: number
  send(message: Uint8Array): void
  subscribe(handlers: {
    message(message: Uint8Array): void
    close(): void
    error(reason: unknown): void
    bufferedAmountLow(): void
  }): () => void
}

/** Источник уже подготовленных bytes; право назначить выпуск здесь не возникает. */
export interface ReleasePeerSource extends ReleaseArtifactSource {
  readGraph(expectedDigest: string): Promise<PublishedReleaseGraph>
}

/** Ограничения одного подключённого transport; consumer продвигает stream в пределах timeout. */
export interface ReleasePeerOptions {
  timeoutMs?: number
  maxRequests?: number
  maxGraphBytes?: number
  maxBufferedBytes?: number
}

/**
Получает graph по доверенному ожидаемому digest и bytes по точной identity.
Hash artifacts окончательно проверяет installed store; transport проверяет
корреляцию, последовательность и длины. Проверки: [transport](../../spec/peer.spec.ts).
*/
export interface ReleasePeer extends ReleaseArtifactSource {
  getGraph(expectedDigest: string, options?: {signal?: AbortSignal}): Promise<PublishedReleaseGraph>
  readArtifact(identity: InstalledArtifactIdentity, options?: {signal?: AbortSignal}): AsyncIterable<Uint8Array>
  serve(source: ReleasePeerSource): () => void
  /** Ждёт завершения принятых network requests, включая cleanup отменённого source. Admission закрывает владелец. */
  whenIdle(): Promise<void>
  close(reason?: unknown): void
}
