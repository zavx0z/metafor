import { useStdout } from "ink"

export function useScreenSize() {
  const { stdout } = useStdout()
  const width = stdout?.columns || 80
  const height = stdout?.rows || 24
  const leftWidth = Math.floor(width / 2)

  return { width, height, leftWidth }
}
