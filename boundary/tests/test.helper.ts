import { openSharedDbMemoryBackend } from "@shared/db"
import { writeRuntimeFromSharedDb } from "../boundary"

export async function resetBoundaryForTest(): Promise<void> {
  const backend = openSharedDbMemoryBackend()

  try {
    await writeRuntimeFromSharedDb(backend)
  } finally {
    backend.close()
  }
}
