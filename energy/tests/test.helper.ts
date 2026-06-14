import { openDbSqliteBackend } from "@metafor/boundary/db"
import {force} from "@metafor/boundary"
import {writeRuntimeFromDb} from "../energy"

export async function resetEnergyForTest(): Promise<void> {
  force.close()
  const backend = openDbSqliteBackend()

  try {
    await writeRuntimeFromDb(backend)
  } finally {
    backend.close()
  }
}
