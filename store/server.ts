import {SQL} from "bun"
import {StoreMetaSqlite} from "@store/meta/sqlite"
import {StoreActorSqlite} from "@store/actor/sqlite"

import type {Store} from "./index.ts"

export type StoreParticle =
  | "higgs" // topology-импульс: поля topology и порождение ветвей в meta/actor
  | "graviton" // gravity-импульс: отношения, адресация и структурная рамка meta/actor
  | "photon" // state-импульс: изменение состояний actor
  | "gluon" // value-импульс: изменение значений обычных field
  | "z" // neutral weak-импульс: координация процессов
  | "w+" // charged weak-импульс: успешный результат процесса
  | "w-" // charged weak-импульс: неуспешный результат процесса

export type StorePatch =
  | {
      op: "add" | "replace" | "test"
      path: string
      value?: unknown
    }
  | {
      op: "remove"
      path: string
    }
  | {
      op: "move" | "copy"
      from: string
      path: string
    }

export type StoreUpdateMessage = {
  part: StoreParticle
  patch: StorePatch[]
}

const notImplemented = (description: string): never => {
  throw new Error(`Store patch update is not implemented yet: ${description}`)
}

const applyStorePatchMessage = async (message: StoreUpdateMessage): Promise<void> => {
  const [patch] = message.patch
  if (!patch) return

  switch (message.part) {
    case "higgs":
      // Higgs меняет topology: в meta это topology-bearing declarations,
      // в actor это выбор ветвей, множественность и материализованные последствия topology.
      return notImplemented("higgs patch should update topology across meta and actor store")

    case "graviton":
      // Graviton задаёт gravity-рамку: в meta это отношения, локализация и версии,
      // в actor это root/parent/order, адресация, связность и structural barrier.
      return notImplemented("graviton patch should update gravity frame across meta and actor store")

    case "photon":
      // Photon меняет состояния actor; чтение остаётся через Actor.state().
      return notImplemented("photon patch should update actor state")

    case "gluon":
      // Gluon меняет значения field: actor_value/value и entanglement value-слоя.
      return notImplemented("gluon patch should update field values")

    case "z":
      // Z координирует процессы: claim/accept/reject/release и neutral mediation.
      return notImplemented("z patch should update process coordination")

    case "w+":
      // W+ применяет успешный результат процесса: result patches, state/value последствия.
      return notImplemented("w+ patch should apply successful process result")

    case "w-":
      // W- применяет неуспешный результат процесса: error patches и rollback/mark state.
      return notImplemented("w- patch should apply failed process result")
  }
}

export const open = async (filename?: string): Promise<Store> => {
  const fileBacked = filename !== undefined && filename !== ":memory:"

  const sql = new SQL(fileBacked ? `sqlite://${filename}` : "sqlite::memory:")
  await sql.unsafe("PRAGMA foreign_keys = ON;")
  if (fileBacked) {
    await sql.unsafe("PRAGMA journal_mode = WAL;")
    await sql.unsafe("PRAGMA synchronous = NORMAL;")
    await sql.unsafe("PRAGMA busy_timeout = 5000;")
  }

  return {
    meta: await StoreMetaSqlite.open(sql),
    actor: await StoreActorSqlite.open(sql),
    update: applyStorePatchMessage,
    async close() {
      try {
        if (fileBacked) await sql.unsafe("PRAGMA wal_checkpoint(TRUNCATE);")
        await sql.close()
      } catch {
        // ignore double-close
      }
    },
  }
}
