import { useState, useEffect } from "react"
import { Worker } from "worker_threads"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export function useVersionCheck(currentVersion: string) {
  const [latestVersion, setLatestVersion] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasUpdate, setHasUpdate] = useState(false)

  useEffect(() => {
    const workerPath = join(__dirname, "workers", "version-checker.js")
    const worker = new Worker(workerPath)

    worker.on("message", (msg: any) => {
      if (msg.type === "latest") {
        setLatestVersion(msg.version)
        setIsLoading(false)
        if (msg.version !== currentVersion) {
          setHasUpdate(true)
        }
      } else if (msg.type === "error") {
        setIsLoading(false)
      }
    })

    return () => {
      worker.terminate()
    }
  }, [currentVersion])

  return { latestVersion, isLoading, hasUpdate }
}
