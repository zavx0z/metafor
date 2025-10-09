/**
 * Пример использования внутреннего механизма коммуникации между акторами
 *
 * Логика работы:
 * 1. Внутренний механизм работает всегда
 * 2. BroadcastChannel включен по умолчанию
 * 3. Акторы подписываются на оба канала одновременно
 * 4. Внутренний реестр - для быстрой коммуникации в том же потоке
 * 5. BroadcastChannel - для получения сообщений из других потоков/воркеров
 * 6. Сообщения отправляются в оба канала
 */

import { Actor } from "./actor"
import type { MetaSchema } from "./metafor"

// Внутренний механизм работает всегда
// BroadcastChannel включен по умолчанию
// Actor.setBroadcastChannel(true) // не нужно - включено по умолчанию

// Пример схемы для актора
const actorSchema: MetaSchema = {
  name: "example-actor",
  context: {
    counter: { type: "number", default: 0 },
    message: { type: "string", default: "Hello" },
  },
  states: {
    idle: {
      active: {
        conditions: { counter: { gt: 5 } },
      },
    },
    active: {
      idle: {
        conditions: { counter: { lte: 5 } },
      },
    },
  },
  processes: {
    active: {
      action: {
        src: `({ context, update }) => {
          console.log("Актор активен, счетчик:", context.counter)
          update({ counter: context.counter + 1 })
          return "processed"
        }`,
      },
      success: {
        src: `({ update, data }) => {
          console.log("Обработка завершена:", data)
        }`,
      },
    },
  },
  reactions: {
    reactions: {
      "counter-update": {
        label: "Обновление счетчика",
        cond: {
          op: "replace",
          path: "/context/counter",
        },
        src: `({ context, meta, actor, update }) => {
          console.log(\`Актор \${actor} (\${meta}) обновил счетчик на \${context.counter}\`)
          // Можно добавить дополнительную логику реакции
        }`,
      },
    },
    states: {
      idle: ["counter-update"],
      active: ["counter-update"],
    },
  },
}

// Создаем несколько акторов
const actor1 = Actor.fromSchema(actorSchema, "actor-1")
const actor2 = Actor.fromSchema(actorSchema, "actor-2")
const actor3 = Actor.fromSchema(actorSchema, "actor-3")

console.log("Количество зарегистрированных акторов:", Actor.getRegisteredActorsCount())
console.log("Внутренний механизм включен:", Actor.isInternalMessagingEnabled())

// Обновляем контекст первого актора - это должно вызвать реакции у других акторов
actor1.update({ counter: 10 })

// Проверяем, что акторы перешли в активное состояние
setTimeout(() => {
  console.log("Состояние актора 1:", actor1.state.current)
  console.log("Состояние актора 2:", actor2.state.current)
  console.log("Состояние актора 3:", actor3.state.current)

  // Очищаем ресурсы
  actor1.destroy()
  actor2.destroy()
  actor3.destroy()

  console.log("Количество акторов после очистки:", Actor.getRegisteredActorsCount())
}, 100)

// Пример отключения BroadcastChannel (только внутренний механизм)
// Actor.setBroadcastChannel(false)
