import type { SQL } from "bun"
import type { MetaDSL } from "../../.."

const resolveFieldUuid = async (sql: SQL, src: string, fieldKey: string): Promise<string | null> => {
  const row = (
    await sql<Array<{ uuid: string }>>`
      SELECT uuid FROM field WHERE wimp = ${src} AND key = ${fieldKey} LIMIT 1
    `
  )[0]
  return row?.uuid ?? null
}

const resolveStateUuid = async (sql: SQL, src: string, name: string): Promise<string | null> => {
  const row = (
    await sql<Array<{ uuid: string }>>`
      SELECT uuid FROM superposition WHERE wimp = ${src} AND name = ${name} LIMIT 1
    `
  )[0]
  return row?.uuid ?? null
}

export async function createSuperposition(sql: SQL, meta: MetaDSL, src: string): Promise<void> {
  const states = Object.keys(meta.superposition)

  // 1. States
  for (let i = 0; i < states.length; i++) {
    const name = states[i]!
    const uuid = crypto.randomUUID()
    await sql`INSERT INTO superposition (uuid, wimp, name, position) VALUES (${uuid}, ${src}, ${name}, ${i})`
  }

  // 2. Transitions & Conditions
  for (const [fromName, transitions] of Object.entries(meta.superposition)) {
    if (!transitions) continue
    const fromUuid = await resolveStateUuid(sql, src, fromName)
    if (!fromUuid) continue

    let transitionPos = 0
    for (const [toName, cond] of Object.entries(transitions as Record<string, unknown>)) {
      const toUuid = await resolveStateUuid(sql, src, toName)
      if (!toUuid) continue
      const transitionUuid = crypto.randomUUID()

      await sql`
        INSERT INTO transition (uuid, from_superposition, to_superposition, position)
        VALUES (${transitionUuid}, ${fromUuid}, ${toUuid}, ${transitionPos++})
      `

      if (cond && typeof cond === "object") {
        let condPos = 0
        for (const [fieldKey, predicate] of Object.entries(cond as Record<string, unknown>)) {
          const fieldUuid = await resolveFieldUuid(sql, src, fieldKey)
          if (!fieldUuid) continue

          const condUuid = crypto.randomUUID()
          await sql`
            INSERT INTO condition (uuid, transition, field, position)
            VALUES (${condUuid}, ${transitionUuid}, ${fieldUuid}, ${condPos++})
          `

          const normalizedPredicate =
            predicate === null
              ? { null: true }
              : typeof predicate === "boolean" || typeof predicate === "number" || typeof predicate === "string"
                ? { eq: predicate }
                : predicate && typeof predicate === "object"
                  ? (predicate as Record<string, unknown>)
                  : undefined

          if (normalizedPredicate && typeof normalizedPredicate === "object") {
            let predOrder = 0
            for (const [op, val] of Object.entries(normalizedPredicate)) {
              const predUuid = crypto.randomUUID()
              let operator = op
              let valueKind = "null"
              let valueBoolean: number | null = null
              let valueNumber: number | null = null
              let valueText: string | null = null
              const valueVariant: string | null = null

              if (op === "notEq") operator = "neq"

              if (op === "null") {
                operator = val === false ? "neq" : "eq"
                valueKind = "null"
              } else if (typeof val === "boolean") {
                valueKind = "boolean"
                valueBoolean = val ? 1 : 0
              } else if (typeof val === "number") {
                valueKind = "number"
                valueNumber = val
              } else if (typeof val === "string") {
                valueKind = "string"
                valueText = val
              }

              await sql`
                INSERT INTO condition_predicate (uuid, condition, predicate_order, subject_kind, operator,
                                                 value_kind, value_boolean, value_number, value_text,
                                                 value_variant)
                VALUES (${predUuid}, ${condUuid}, ${predOrder++}, ${"value"}, ${operator},
                        ${valueKind}, ${valueBoolean}, ${valueNumber}, ${valueText},
                        ${valueVariant})
              `
            }
          }
        }
      }
    }
  }
}
