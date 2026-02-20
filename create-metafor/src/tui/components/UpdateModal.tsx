import React from "react"
import { Box, Text } from "ink"

interface UpdateModalProps {
  currentVersion: string
  latestVersion: string
  selectedButton: "update" | "later"
}

export function UpdateModal({ currentVersion, latestVersion, selectedButton }: UpdateModalProps) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      padding={1}
      width={50}
    >
      <Box justifyContent="center" marginBottom={1}>
        <Text bold color="yellow">⚠️ Доступно обновление</Text>
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>Текущая версия: </Text>
        <Text>v{currentVersion}</Text>
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>Новая версия: </Text>
        <Text color="green">v{latestVersion}</Text>
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>Обновить сейчас?</Text>
      </Box>

      <Box justifyContent="center" gap={2}>
        <Box>
          {selectedButton === "update" ? (
            <Text backgroundColor="yellow" color="black"> Обновить </Text>
          ) : (
            <Text dimColor> Обновить </Text>
          )}
        </Box>

        <Box>
          {selectedButton === "later" ? (
            <Text backgroundColor="yellow" color="black"> Позже </Text>
          ) : (
            <Text dimColor> Позже </Text>
          )}
        </Box>
      </Box>

      <Box justifyContent="center" marginTop={1}>
        <Text dimColor>← → выбор · Enter — ок</Text>
      </Box>
    </Box>
  )
}
