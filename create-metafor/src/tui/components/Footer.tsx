import React from "react"
import { Box, Text } from "ink"
import packageJson from "../../../package.json"
import { useVersionCheck } from "../hooks/useVersionCheck"

export function Footer() {
  const { latestVersion, isLoading, hasUpdate } = useVersionCheck(packageJson.version)

  return (
    <Box padding={1} borderTop justifyContent="space-between">
      <Box>
        <Text dimColor>v{packageJson.version}</Text>
        {isLoading && <Text dimColor> ⠋</Text>}
        {!isLoading && latestVersion && latestVersion === packageJson.version && (
          <Text color="green"> ✓</Text>
        )}
        {!isLoading && hasUpdate && (
          <Text color="yellow"> ↻</Text>
        )}
      </Box>
      <Text dimColor>Esc — выход | ? — помощь | / — меню</Text>
    </Box>
  )
}
