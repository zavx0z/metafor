import React from "react"
import { Box, Text } from "ink"
import packageJson from "../../../package.json"

export function Footer() {
  return (
    <Box padding={1} borderTop justifyContent="space-between">
      <Text dimColor>v{packageJson.version}</Text>
      <Text dimColor>Esc — выход | ? — помощь | / — меню</Text>
    </Box>
  )
}
