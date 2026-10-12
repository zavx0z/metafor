import {
  createInstalledReleaseStore,
  type InstalledReleaseCandidate,
  type PublishedReleaseGraph,
  type ReleaseArtifactSource,
} from "@metafor/tech-release/installed"

/** Источник предлагает bytes только явно назначенного полного состава. */
export interface ServerReleaseSource extends ReleaseArtifactSource {
  getGraph(expectedDigest: string): Promise<PublishedReleaseGraph>
}

export interface ServerReleaseReceiverOptions {
  readonly store: ReturnType<typeof createInstalledReleaseStore>
  /** Capability startup для уже сохранённой и проверенной цели. */
  readonly activate: (digest: string) => Promise<void>
}

/**
Серверный аналог получения browser release: точная цель → проверенный
установленный кандидат → запрос handover. Получатель ничего не компилирует.
Повтор и продолжение используют тот же immutable graph и локальные objects.
*/
export function createServerReleaseReceiver(options: ServerReleaseReceiverOptions) {
  let queue = Promise.resolve()
  return {
    update(expectedDigest: string, source: ServerReleaseSource): Promise<InstalledReleaseCandidate> {
      const operation = queue.then(async () => {
        if (!/^[a-f0-9]{64}$/.test(expectedDigest)) throw new Error("Server release target must be an exact digest")
        const graph = await source.getGraph(expectedDigest)
        const candidate = await options.store.prepare(graph, source, expectedDigest)
        await options.activate(candidate.digest)
        return candidate
      })
      queue = operation.then(() => undefined, () => undefined)
      return operation
    },
  }
}
