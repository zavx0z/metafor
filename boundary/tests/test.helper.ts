import { openDbSqliteBackend } from "store/db"
import {force} from "store"
import {writeRuntimeFromDb} from "../boundary"

export async function resetBoundaryForTest(): Promise<void> {
  force.close()
  const backend = openDbSqliteBackend()

  try {
    await writeRuntimeFromDb(backend)
  } finally {
    backend.close()
  }
}
