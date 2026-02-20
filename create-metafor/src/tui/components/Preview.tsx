import React from "react"
import { Box, Text } from "ink"

interface PreviewProps {
  name: string
  desc: string
  dir: string
}

export function Preview({ name, desc, dir }: PreviewProps) {
  return (
    <Box flexDirection="column">
      {name && (
        <Box>
          <Text dimColor>name: </Text>
          <Text color="green">{name}</Text>
        </Box>
      )}

      {desc && (
        <Box>
          <Text dimColor>desc: </Text>
          <Text color="green">{desc}</Text>
        </Box>
      )}

      {dir && (
        <Box>
          <Text dimColor>dir: </Text>
          <Text color="green">{dir}</Text>
        </Box>
      )}
    </Box>
  )
}
