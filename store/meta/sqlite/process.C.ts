import type { Database } from "bun:sqlite"
import type { MetaDSL, ParsedDestroy, ParsedProcess } from "../../.."
import type { FieldUuidByKey } from "./process.t.ts"

const createProcessReads = (
  db: Database,
  processUuid: string,
  phase: "action" | "success" | "error",
  fieldKeys: string[] | undefined,
  fieldUuids: FieldUuidByKey,
): void => {
  for (const fieldKey of fieldKeys ?? []) {
    const fieldUuid = fieldUuids.get(fieldKey)
    if (!fieldUuid) continue

    db.query("INSERT INTO process_action_read (process, field, phase) VALUES (?, ?, ?)")
      .run(processUuid, fieldUuid, phase)
  }
}

const createProcessWrites = (
  db: Database,
  processUuid: string,
  phase: "success" | "error",
  fieldKeys: string[] | undefined,
  fieldUuids: FieldUuidByKey,
): void => {
  for (const fieldKey of fieldKeys ?? []) {
    const fieldUuid = fieldUuids.get(fieldKey)
    if (!fieldUuid) continue

    db.query("INSERT INTO process_action_write (process, field, phase) VALUES (?, ?, ?)")
      .run(processUuid, fieldUuid, phase)
  }
}

export function createProcess(
  db: Database,
  meta: MetaDSL,
  src: string,
  fieldUuids: FieldUuidByKey,
): void {
  if (!meta.processes) return

  Object.entries(meta.processes).forEach(([state, p]) => {
    const uuid = crypto.randomUUID()
    const process = p as ParsedProcess | ParsedDestroy
    db.query("INSERT INTO process (uuid, meta, key, type, label, desc) VALUES (?, ?, ?, ?, ?, ?)")
      .run(uuid, src, state, process.type || "action", process.label || null, process.desc || null)

    if (process.env) {
      process.env.forEach((env) => {
        db.query("INSERT INTO process_env (process, env) VALUES (?, ?)").run(uuid, env)
      })
    }

    if (process.type === "finally") {
      db.query("INSERT INTO process_finally (process, before) VALUES (?, ?)")
        .run(uuid, process.before.src)

      for (const fieldKey of process.before.read ?? []) {
        const fieldUuid = fieldUuids.get(fieldKey)
        if (!fieldUuid) continue

        db.query("INSERT INTO process_finally_read (process, field) VALUES (?, ?)")
          .run(uuid, fieldUuid)
      }

      return
    }

    db.query(
      `INSERT INTO process_action (process, action, action_import_specifier, action_wrapper_src, success, error)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      uuid,
      process.action.src,
      process.action.importSpecifier || null,
      process.action.wrapperSrc || null,
      process.success?.src || null,
      process.error?.src || null,
    )

    createProcessReads(db, uuid, "action", process.action.read, fieldUuids)
    createProcessReads(db, uuid, "success", process.success?.read, fieldUuids)
    createProcessReads(db, uuid, "error", process.error?.read, fieldUuids)
    createProcessWrites(db, uuid, "success", process.success?.write, fieldUuids)
    createProcessWrites(db, uuid, "error", process.error?.write, fieldUuids)
  })
}
