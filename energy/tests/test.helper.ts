import { openDbSqliteBackend } from "store/db"
import {force} from "store"
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
