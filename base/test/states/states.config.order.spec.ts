import { test, expect } from "bun:test"
import type { StatesConfig } from "../../../schema/states.t.ts"

test("Конфигурация состояний заказа", () => {
  const orderStates: StatesConfig = {
    pending: {
      confirmed: { paymentReceived: true },
    },
    confirmed: {
      shipped: { inventoryAvailable: true },
    },
    shipped: {
      delivered: { deliveryCompleted: true },
    },
    delivered: {}, // Конечное состояние без переходов
  }

  expect(orderStates.pending?.confirmed?.paymentReceived, "проверка перехода pending -> confirmed").toBe(true)
  expect(orderStates.confirmed?.shipped?.inventoryAvailable, "проверка перехода confirmed -> shipped").toBe(true)
  expect(orderStates.shipped?.delivered?.deliveryCompleted, "проверка перехода shipped -> delivered").toBe(true)
  expect(Object.keys(orderStates.delivered || {}), "проверка конечного состояния").toHaveLength(0)
})
