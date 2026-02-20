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
          <Text dimColor> ✓ latest</Text>
        )}
        {!isLoading && hasUpdate && (
          <Text color="yellow"> ⚠ update: v{latestVersion}</Text>
        )}
      </Box>
      <Text dimColor>Esc — выход | ? — помощь | / — меню</Text>
    </Box>
  )
}
