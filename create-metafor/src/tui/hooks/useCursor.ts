import { useState, useEffect } from "react"
import type { View } from "../types"

export function useCursor(view: View) {
  const [cursorVisible, setCursorVisible] = useState(true)

  // Останавливаем курсор в интерактивном режиме
  useEffect(() => {
    if (view !== "input") {
      setCursorVisible(false)
    } else {
      setCursorVisible(true)
    }
  }, [view])

  useEffect(() => {
    if (view === "input") {
      const interval = setInterval(() => {
        setCursorVisible((v) => !v)
      }, 500)
      return () => clearInterval(interval)
    }
  }, [view])

  return cursorVisible
}
