import React from "react"
import { Box, Text } from "ink"
import type { MenuItem } from "../types"

interface MenuListProps {
  items: MenuItem[]
  selectedItem: number
}

export function MenuList({ items, selectedItem }: MenuListProps) {
  return (
    <Box flexDirection="column" alignItems="center" width="100%">
      <Box marginBottom={1}>
        <Text bold color="green">Меню</Text>
      </Box>
      {items.map((item, index) => (
        <Box key={item.key} width="100%">
          {index === selectedItem ? (
            <Text backgroundColor="white" color="black">
               {item.key} — {item.label}
            </Text>
          ) : (
            <Text dimColor>
              {item.key} — {item.label}
            </Text>
          )}
        </Box>
      ))}
    </Box>
  )
}
