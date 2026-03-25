import { openSharedDbSqliteBackend } from "@shared/db"
import { clearBoundaryRuntimePersistence, closeBoundaryProtocolChannels, writeRuntimeFromSharedDb } from "../boundary"

export async function resetBoundaryForTest(): Promise<void> {
  closeBoundaryProtocolChannels()
  const backend = openSharedDbSqliteBackend()

  try {
    await writeRuntimeFromSharedDb(backend)
  } finally {
    backend.close()
    clearBoundaryRuntimePersistence()
  }
}
