import { openDbSqliteBackend } from "store/db"
import { closeBoundaryProtocolChannels, writeRuntimeFromDb } from "../boundary"

export async function resetBoundaryForTest(): Promise<void> {
  closeBoundaryProtocolChannels()
  const backend = openDbSqliteBackend()

  try {
    await writeRuntimeFromDb(backend)
  } finally {
    backend.close()
  }
}
