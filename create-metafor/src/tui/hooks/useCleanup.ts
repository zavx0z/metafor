import { useEffect } from "react"

export function useCleanup() {
  useEffect(() => {
    return () => {
      process.stdout.write("\x1b[2J\x1b[H")
    }
  }, [])
}
