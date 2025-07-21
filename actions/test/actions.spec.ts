import { test, expect, describe } from "bun:test"
import { createActionsConfig } from "../index"
import type { ActionType } from "../index.t"
import { types } from "../../context"
import type { ExtractValues } from "../../context"

describe("createActionsConfig — chain API", () => {
  const ctxSchema = {
    name: types.string.required("anon"),
    age: types.number.required(0),
  }
  type CtxSchema = typeof ctxSchema
  type Ctx = ExtractValues<CtxSchema>

  test("базовый chain API", () => {
    const actions = createActionsConfig<CtxSchema, "guest" | "user">((action: ActionType<CtxSchema>) => ({
      guest: action(({ context }: { context: Ctx }) => ({ name: context.name, age: context.age + 1 }))
        .success(({ update, data }: { update: (v: Partial<Ctx>) => void; data: Ctx }) => {
          expect(data.name, "data.name должен быть строкой").toBeTypeOf("string")
          expect(data.age, "data.age должен быть числом").toBeTypeOf("number")
          update({ name: data.name })
        })
        .error(({ update, error }: { update: (v: Partial<Ctx>) => void; error: any }) => {
          expect(error, "error должен быть определён").toBeDefined()
          update({ name: "error" })
        }),
      // user не определён — Partial<Record<...>>
    }))
    expect(typeof actions.guest?.success, "Метод success должен быть функцией").toBe("function")
    expect(typeof actions.guest?.error, "Метод error должен быть функцией").toBe("function")
  })

  test("строгая типизация", () => {
    const schema = { name: types.string.required("anon") }
    type S = typeof schema
    type V = ExtractValues<S>
    const actions = createActionsConfig<S, "guest">((action: ActionType<S>) => ({
      guest: action(({ context }: { context: V }) => context.name)
        .success(({ update, data }: { update: (v: Partial<V>) => void; data: string }) => {
          // @ts-expect-error update требует Partial<V>
          update({ age: 42 })
          update({ name: data })
        })
        .error(({ update, error }: { update: (v: Partial<V>) => void; error: any }) => {
          update({ name: error.message })
        }),
    }))
    expect(typeof actions.guest?.success, "Метод success должен быть функцией").toBe("function")
  })

  test("порядок вызова error().success()", () => {
    const schema = { name: types.string.required("anon") }
    type S = typeof schema
    type V = ExtractValues<S>
    const actions = createActionsConfig<S, "guest">((action: ActionType<S>) => ({
      guest: action(({ context }: { context: V }) => context.name)
        .error(({ update, error }: { update: (v: Partial<V>) => void; error: any }) => update({ name: error.message }))
        .success(({ update, data }: { update: (v: Partial<V>) => void; data: string }) => update({ name: data })),
    }))
    expect(typeof actions.guest?.success, "Метод success должен быть функцией").toBe("function")
    expect(typeof actions.guest?.error, "Метод error должен быть функцией").toBe("function")
  })

  test("можно не указывать обработчики", () => {
    const schema = { name: types.string.required("anon") }
    type S = typeof schema
    type V = ExtractValues<S>
    const actions = createActionsConfig<S, "guest">((action: ActionType<S>) => ({
      guest: action(({ context }: { context: V }) => context.name),
    }))
    expect(typeof actions.guest?.success, "Метод success должен быть функцией").toBe("function")
    expect(typeof actions.guest?.error, "Метод error должен быть функцией").toBe("function")
  })
})
