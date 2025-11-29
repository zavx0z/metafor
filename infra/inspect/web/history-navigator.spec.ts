import { describe, it, expect } from "bun:test"
import { HistoryNavigator } from "./history-navigator"

describe("HistoryNavigator", () => {
  it("возвращает null пока нет истории", () => {
    const navigator = new HistoryNavigator<number>()
    expect(navigator.current(), "до загрузки история отсутствует").toBeNull()
  })

  it("при загрузке показывает последний срез", () => {
    const navigator = new HistoryNavigator<number>()
    navigator.load([[1], [2], [3]])
    expect(navigator.current(), "последний срез становится текущим").toEqual([3])
  })

  it("шагает назад к предыдущему срезу", () => {
    const navigator = new HistoryNavigator<number>()
    navigator.load([[1], [2], [3]])
    navigator.stepBack()
    expect(navigator.current(), "после шага назад активен предпоследний срез").toEqual([2])
  })

  it("сбрасывает состояние после reset", () => {
    const navigator = new HistoryNavigator<number>()
    navigator.load([[1], [2]])
    navigator.reset()
    expect(navigator.current(), "reset очищает текущий срез").toBeNull()
  })
})



