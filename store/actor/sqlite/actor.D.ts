import type { SQL } from "bun"

export const deleteActor = async (sql: SQL, uuid: string): Promise<void> => {
  await sql.begin(async (tx) => {
    const collected = await tx<Array<{ value: string }>>`SELECT value FROM actor_value WHERE actor = ${uuid}`
    const oldValueIds = collected.map((r) => r.value)
    await tx`DELETE FROM actor WHERE uuid = ${uuid}`
    for (const valueId of oldValueIds) {
      await tx`
        DELETE FROM value WHERE uuid = ${valueId} AND NOT EXISTS (SELECT 1 FROM actor_value WHERE value = uuid)
      `
    }
  })
}
