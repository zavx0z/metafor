import React from "react"
import { Box, Text } from "ink"

interface InputFieldProps {
  input: string
  cursor: string
  isActive: boolean
  width: number
}

export function InputField({ input, cursor, isActive, width }: InputFieldProps) {
  return (
    <Box width={width} flexDirection="column">
      <Box paddingLeft={1}>
        <Text color="green">
          {input}
          {isActive ? (
            <Text backgroundColor="green" color="black">{cursor}</Text>
          ) : (
            <Text dimColor>{cursor}</Text>
          )}
        </Text>
      </Box>
    </Box>
  )
}
