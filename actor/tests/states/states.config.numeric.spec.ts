import { test, expect } from "bun:test"
import type { StatesConfig } from "../../../meta/states.t.ts"

test("Конфигурация состояний с числовыми условиями", () => {
  const gameStates: StatesConfig = {
    menu: {
      playing: { level: { gte: 1 } },
    },
    playing: {
      paused: { pauseRequested: true },
      gameOver: { lives: { lte: 0 } },
    },
    paused: {
      playing: { resumeRequested: true },
      menu: { exitToMenu: true },
    },
    gameOver: {
      menu: { restartRequested: true },
    },
  }

  expect((gameStates.menu?.playing?.level as any)?.gte, "проверка числового условия level >= 1").toBe(1)
  expect((gameStates.playing?.gameOver?.lives as any)?.lte, "проверка числового условия lives <= 0").toBe(0)
  expect(gameStates.playing?.paused?.pauseRequested, "проверка булевого условия pauseRequested").toBe(true)
})
