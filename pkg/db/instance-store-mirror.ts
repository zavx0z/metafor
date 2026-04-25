import type { DbSyncMessage, ProtocolDomain } from "../protocol/index.ts"
import type { DbInstanceStore } from "./instance-store.t.ts"
import type { DbFieldOrbitRow, DbParticleShellRow } from "./instance.t.ts"

/**
 * Лёгкий канал-publisher: совместимый с BroadcastChannel-API подмножеством,
 * необходимым для mirror. Делает тестирование и WS-bridge тривиальным.
 */
export interface DbSyncPublisher {
  postMessage(message: DbSyncMessage): void
}

/**
 * Оборачивает локальный {@link DbInstanceStore} так, что каждая мутация (`clearWorld`,
 * `insertParticleShell`, `insertFieldOrbit`) — после успешного применения локально —
 * публикует per-row событие в {@link DbSyncPublisher}.
 *
 * Порядок гарантирован: запись завершается до publish, поэтому подписчик, читающий
 * канал по очереди, видит события в том же порядке, в котором они применялись локально.
 *
 * Read-методы делегируются один-к-одному.
 */
export const createMirroredInstanceStore = (
  local: DbInstanceStore,
  publisher: DbSyncPublisher,
  source: ProtocolDomain,
): DbInstanceStore => ({
  close: () => local.close(),
  selectAllParticleShells: (rootSrc) => local.selectAllParticleShells(rootSrc),
  selectAllFieldOrbits: (rootSrc) => local.selectAllFieldOrbits(rootSrc),
  selectParticleShellsByParent: (rootSrc, parent) => local.selectParticleShellsByParent(rootSrc, parent),
  selectFieldOrbitsByParticle: (rootSrc, particle) => local.selectFieldOrbitsByParticle(rootSrc, particle),

  async clearWorld(rootSrc) {
    await local.clearWorld(rootSrc)
    publisher.postMessage({
      channel: "db-sync",
      source,
      rootSrc,
      op: { kind: "clear-world" },
    })
  },

  async insertParticleShell(rootSrc, shell) {
    await local.insertParticleShell(rootSrc, shell)
    publisher.postMessage({
      channel: "db-sync",
      source,
      rootSrc,
      op: { kind: "insert-particle", row: shell },
    })
  },

  async insertFieldOrbit(rootSrc, orbit) {
    await local.insertFieldOrbit(rootSrc, orbit)
    publisher.postMessage({
      channel: "db-sync",
      source,
      rootSrc,
      op: { kind: "insert-field", row: orbit },
    })
  },
})

/**
 * Применяет одно `db-sync` сообщение на целевой store. Используется client-side для
 * зеркалирования server-side изменений в local IDB через тот же {@link DbInstanceStore}.
 *
 * Не различает источник (`source`) — апплайер просто исполняет операцию.
 */
export const applyDbSyncMessage = async (
  store: DbInstanceStore,
  message: DbSyncMessage,
): Promise<void> => {
  if (message.op.kind === "clear-world") {
    await store.clearWorld(message.rootSrc)
    return
  }
  if (message.op.kind === "insert-particle") {
    await store.insertParticleShell(message.rootSrc, message.op.row as DbParticleShellRow)
    return
  }
  await store.insertFieldOrbit(message.rootSrc, message.op.row as DbFieldOrbitRow)
}
