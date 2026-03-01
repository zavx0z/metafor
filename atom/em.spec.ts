import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { Atom } from "./atom.ts"
import type { Meta } from "../meta/metafor.ts"
import { messagesFixture } from "../infra/test/fixture/message.ts"
import { EM } from "./em.ts"
import { Initiator } from "./em.t.ts"

describe("Каналы коммуникации между атомами", () => {
  let messagesFixtureInstance: ReturnType<typeof messagesFixture>

  beforeEach(() => {
    // @ts-ignore
    EM.charged.clear()
    EM.clearHistory()
    messagesFixtureInstance = messagesFixture({ meta: "test-atom" })
  })

  afterEach(() => {
    // Уничтожаем все атомы перед изменением канала
    // @ts-ignore
    for (const atom of EM.charged) {
      atom.destroy()
    }
    // @ts-ignore
    EM.charged.clear()
    // Безопасно закрываем канал
    // @ts-expect-error - setChannel защищенный, используется только в тестах
    EM.setChannel(null)
  })

  const testSchema: Meta = {
    name: "test-atom",
    fields: {
      value: { type: "number", default: 0 },
      source: { type: "string", default: "none" },
    },
    superposition: {
      initial: {},
    },
    reactions: {
      reactions: {
        "value-reaction": {
          label: "Реакция на изменение значения",
          cond: '({ self }) => ({ op: "replace", path: "/fields" })',
          src: `({ fields, meta, atom, update }) => {
            // Реакция устанавливает источник сообщения (безопасно - не вызывает новую реакцию)
            update({ 
              source: "reaction"
            })
          }`,
        },
      },
      superposition: {
        initial: ["value-reaction"],
      },
    },
  }

  const simpleTestSchema: Meta = {
    name: "test-atom",
    fields: {
      value: { type: "number", default: 0 },
    },
    superposition: {
      initial: {},
    },
    reactions: {
      reactions: {
        "value-reaction": {
          label: "Реакция на изменение значения",
          cond: '({ self }) => ({ op: "replace", path: "/fields" })',
          src: `({ fields, meta, atom, update }) => {
            // Простая реакция - устанавливаем значение в 100
            update({ value: 100 })
          }`,
        },
      },
      superposition: {
        initial: ["value-reaction"],
      },
    },
  }

  const internalTestSchema: Meta = {
    name: "test-atom",
    fields: {
      value: { type: "number", default: 0 },
    },
    superposition: {
      initial: {},
    },
    reactions: {
      reactions: {
        "value-reaction": {
          label: "Реакция на изменение значения",
          cond: '({ self }) => ({ op: "replace", path: "/fields" })',
          src: `({ fields, meta, atom, update }) => {
            // Простая реакция - устанавливаем значение в 1 (безопасно)
            // Реакция сработала
            update({ value: 1 })
          }`,
        },
      },
      superposition: {
        initial: ["value-reaction"],
      },
    },
    mass: {},
  }

  describe.skip("Получение сообщений из обоих каналов", () => {
    it.skip("должен получать сообщения из внутреннего реестра при включенном внутреннем механизме", async () => {
      // @ts-expect-error - setChannel защищенный, используется только в тестах
      EM.setChannel(new BroadcastChannel(EM.CHANNEL))

      const atom1 = Atom.fromSchema({ meta: testSchema, id: "atom-1" })
      const atom2 = Atom.fromSchema({ meta: testSchema, id: "atom-2" })

      // Обновляем контекст первого атома
      atom1.evaluate({ value: 5, source: "direct" })

      // Ждем сообщения через фикстуру
      const messages = await messagesFixtureInstance.waitForMessages(50)

      // Проверяем, что второй атом получил реакцию через внутренний механизм
      expect(atom2.λ.value).toBe(0) // значение не изменилось
      expect(atom2.λ.source).toBe("reaction") // источник изменился

      // Проверяем, что сообщение было отправлено через BroadcastChannel
      expect(messages.length).toBeGreaterThan(0)
      expect(messages[0]!.atom).toBe("atom-1")

      atom1.destroy()
      atom2.destroy()
    })

    it.skip("должен получать сообщения из внутреннего механизма при отключенном BroadcastChannel", async () => {
      // @ts-expect-error - setChannel защищенный, используется только в тестах
      EM.setChannel(null)

      const atom1 = Atom.fromSchema({ meta: testSchema, id: "atom-1" })
      const atom2 = Atom.fromSchema({ meta: testSchema, id: "atom-2" })

      // Обновляем контекст первого атома
      atom1.evaluate({ value: 5, source: "direct" }, Initiator.Nothing)

      // Ждем сообщения через фикстуру
      const messages = await messagesFixtureInstance.waitForMessages(50)

      // Когда BroadcastChannel отключен, атомы все равно получают сообщения через внутренний механизм
      // Поэтому реакция должна сработать
      expect(atom2.λ.value).toBe(0) // значение не изменилось
      expect(atom2.λ.source).toBe("reaction") // источник изменился через внутренний механизм

      // Когда BroadcastChannel отключен, сообщения не отправляются через него
      expect(messages.length).toBe(0)

      atom1.destroy()
      atom2.destroy()
    })
  })

  describe("История импульсов", () => {
    let atom: Atom
    let chunks: ReturnType<typeof EM.getHistoryChunks>
    let lastChunk: ReturnType<typeof EM.getHistoryChunks>[number]

    beforeEach(() => {
      atom = Atom.fromSchema({ meta: simpleTestSchema, id: "history-atom" })
      atom.evaluate({ value: 10 })
      chunks = EM.getHistoryChunks()
      lastChunk = chunks[chunks.length - 1] ?? []
    })

    afterEach(() => {
      atom.destroy()
    })

    it("создает хотя бы один срез после evaluate", () => {
      expect(
        chunks.length,
        "история должна содержать хотя бы один срез после evaluate"
      ).toBeGreaterThan(0)
    })

    it("срез содержит патчи импульсов", () => {
      expect(lastChunk.length, "срез должен содержать патчи импульсов").toBeGreaterThan(0)
    })

    it("фиксирует источник атома в срезе", () => {
      expect(
        lastChunk[0]?.atom,
        "атом в истории совпадает с источником изменений"
      ).toBe("history-atom")
    })

    it("сохраняет патч контекста в истории", () => {
      const hasContextPatch = lastChunk.some((impulse) => impulse.path === "/context")
      expect(hasContextPatch, "контекст должен обновляться в истории").toBe(true)
    })
  })

  describe.skip("Двойная отправка сообщений (BroadcastChannel + внутренний механизм)", () => {
    it.skip("должен отправлять сообщения в оба канала", async () => {
      // @ts-expect-error - setChannel защищенный, используется только в тестах
      EM.setChannel(new BroadcastChannel(EM.CHANNEL))

      const atom1 = Atom.fromSchema({ meta: simpleTestSchema, id: "atom-1" })
      const atom2 = Atom.fromSchema({ meta: simpleTestSchema, id: "atom-2" })

      // Обновляем контекст первого атома
      atom1.evaluate({ value: 5 })

      // Ждем сообщения через фикстуру
      const messages = await messagesFixtureInstance.waitForMessages(50)

      // Проверяем, что сообщение было отправлено через BroadcastChannel
      expect(messages.length).toBeGreaterThan(0)

      // Ищем сообщение с обновлением контекста (replace)
      const contextMessage = messages.find((photon) =>
        photon.impulses.some((patch: any) => patch.op === "replace" && patch.path === "/context")
      )
      expect(contextMessage).toBeDefined()
      expect(contextMessage!.atom).toBe("atom-1")

      // Проверяем, что второй атом получил реакцию через внутренний механизм
      expect(atom2.λ.value).toBe(100)

      atom1.destroy()
      atom2.destroy()
    })

    it("должен регистрировать атомы в реестре независимо от состояния внутреннего механизма", () => {
      // @ts-expect-error - setChannel защищенный, используется только в тестах
      EM.setChannel(null)
      const atom1 = Atom.fromSchema({ meta: simpleTestSchema, id: "atom-1" })
      // @ts-ignore
      expect(EM.charged.size).toBe(1)

      // @ts-expect-error - setChannel защищенный, используется только в тестах
      EM.setChannel(new BroadcastChannel(EM.CHANNEL))
      const atom2 = Atom.fromSchema({ meta: simpleTestSchema, id: "atom-2" })
      // @ts-ignore
      expect(EM.charged.size).toBe(2)

      atom1.destroy()
      atom2.destroy()
    })
  })

  describe("Внутренний механизм коммуникации между атомами", () => {
    beforeEach(() => {
      // @ts-expect-error - setChannel защищенный, используется только в тестах
      EM.setChannel(new BroadcastChannel(EM.CHANNEL))
    })

    it("должен регистрировать атомы в реестре", () => {
      const atom1 = Atom.fromSchema({ meta: internalTestSchema, id: "atom-1" })
      const atom2 = Atom.fromSchema({ meta: internalTestSchema, id: "atom-2" })
      // @ts-expect-error
      expect(EM.charged.size).toBe(2)
      // @ts-expect-error
      expect(EM.channel).toBeDefined()

      atom1.destroy()
      atom2.destroy()
    })

    it.skip("должен отправлять сообщения через внутренний механизм", async () => {
      const atom1 = Atom.fromSchema({ meta: internalTestSchema, id: "atom-1" })
      const atom2 = Atom.fromSchema({ meta: internalTestSchema, id: "atom-2" })

      // Изначальные значения
      expect(atom1.λ.value).toBe(0)
      expect(atom2.λ.value).toBe(0)

      // Обновляем контекст первого атома
      atom1.evaluate({ value: 5 })

      // Даем время на выполнение реакций
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Второй атом должен получить реакцию и установить значение в 1
      expect(atom2.λ.value).toBe(1)

      atom1.destroy()
      atom2.destroy()
    })

    it("должен корректно удалять атомы из реестра", () => {
      const atom1 = Atom.fromSchema({ meta: internalTestSchema, id: "atom-1" })
      const atom2 = Atom.fromSchema({ meta: internalTestSchema, id: "atom-2" })
      // @ts-expect-error
      expect(EM.charged.size).toBe(2)

      atom1.destroy()
      // @ts-expect-error
      expect(EM.charged.size).toBe(1)

      atom2.destroy()
      // @ts-expect-error
      expect(EM.charged.size).toBe(0)
    })

    it("не должен отправлять сообщения самому себе", () => {
      const atom = Atom.fromSchema({ meta: internalTestSchema, id: "atom-1" })
      const initialValue = atom.λ.value

      // Обновляем контекст
      atom.evaluate({ value: 10 })

      // Значение должно остаться тем же, так как реакция не должна сработать на себя
      expect(atom.λ.value).toBe(10)

      atom.destroy()
    })
  })
})
