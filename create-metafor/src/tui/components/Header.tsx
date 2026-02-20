import React from "react"
import { Box, Text } from "ink"
import type { Field, View } from "../types"

interface HeaderProps {
  field: Field
  view: View
}

export function Header({ field, view }: HeaderProps) {
  const getTitle = () => {
    if (field === "name") return "⚛️ Мета для..."
    if (field === "desc") return "⚛️ Мета описание"
    return "⚛️ Мета директория"
  }

  const getHint = () => {
    if (view !== "input") {
      return view === "help" ? "j/k или о/л — навигация" : "j/k или о/л — навигация"
    }
    if (field === "name") {
      return ""
    }
    if (field === "desc") {
      return "Enter — пропустить"
    }
    return "Enter — далее"
  }

  return (
    <Box padding={1} justifyContent="space-between">
      <Text bold color="green">{getTitle()}</Text>
      <Text dimColor>{getHint()}</Text>
    </Box>
  )
}
