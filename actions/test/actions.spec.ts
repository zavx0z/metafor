import { describe, expect, test } from "bun:test"
import { createActionsConfig } from "../index"
import { types } from "../../context"
import type { ExtractValues } from "../../context"

describe("createActionsConfig — chain API", () => {
  const ctxSchema = {
    name: types.string.required("anon"),
    age: types.number.required(0),
  }
  type CtxSchema = typeof ctxSchema

  test("базовый chain API", () => {
    const actions = createActionsConfig<CtxSchema, "guest" | "user">((process) => ({
      guest: process()
        .action(({ context }) => ({ name: context.name, age: context.age + 1 }))
        .success(({ update, data }) => {
          expect(data.name, "data.name должен быть строкой").toBeTypeOf("string")
          expect(data.age, "data.age должен быть числом").toBeTypeOf("number")
          update({ name: data.name })
        })
        .error(({ update, error }) => {
          expect(error, "error должен быть определён").toBeDefined()
          update({ name: "error" })
        }),
      user: process().action(({ context }) => ({ name: context.name, age: context.age })),
    }))
    expect(typeof actions.guest?.success, "Метод success должен быть функцией").toBe("function")
    expect(typeof actions.guest?.error, "Метод error должен быть функцией").toBe("function")
  })

  test("строгая типизация", () => {
    const schema = { name: types.string.required("anon") }
    type S = typeof schema
    const actions = createActionsConfig<S, "guest">((process) => ({
      guest: process()
        .action(({ context }) => context.name)
        .success(({ update, data }) => {
          // @ts-expect-error update требует Partial<V>
          update({ age: 42 })
          update({ name: data })
        })
        .error(({ update, error }) => {
          update({ name: error.message })
        }),
    }))
    expect(typeof actions.guest?.success, "Метод success должен быть функцией").toBe("function")
  })

  test("порядок вызова error().success()", () => {
    const schema = { name: types.string.required("anon") }
    type S = typeof schema
    const actions = createActionsConfig<S, "guest">((process) => ({
      guest: process()
        .action(({ context }) => context.name)
        .error(({ update, error }) => update({ name: error.message }))
        .success(({ update, data }) => update({ name: data })),
    }))
    expect(typeof actions.guest?.success, "Метод success должен быть функцией").toBe("function")
    expect(typeof actions.guest?.error, "Метод error должен быть функцией").toBe("function")
  })

  test("можно не указывать обработчики", () => {
    const schema = { name: types.string.required("anon") }
    type S = typeof schema
    type V = ExtractValues<S>
    const actions = createActionsConfig<S, "guest">((process) => ({
      guest: process().action(({ context }) => context.name),
    }))
    expect(actions.guest?.success, "success должен быть undefined, если не задан").toBeUndefined()
    expect(actions.guest?.error, "error должен быть undefined, если не задан").toBeUndefined()
  })

  test("последний success/error перезаписывает предыдущий", () => {
    const actions = createActionsConfig<{ name: ReturnType<typeof types.string.required> }, "guest">((process) => ({
      guest: process()
        .action(({ context }) => context.name)
        .success(() => {
          throw new Error("should not be called")
        })
        .success(({ update, data }) => update({ name: data }))
        .error(() => {
          throw new Error("should not be called")
        })
        .error(({ update, error }) => update({ name: error.message })),
    }))
    expect(typeof actions.guest?.success, "Метод success должен быть функцией").toBe("function")
    expect(typeof actions.guest?.error, "Метод error должен быть функцией").toBe("function")
  })

  test("getResult возвращает правильный объект", () => {
    const result = createActionsConfig<{ name: ReturnType<typeof types.string.required> }, "guest">((process) => ({
      guest: process()
        .action(({ context }) => context.name)
        .success(({ update, data }) => update({ name: data }))
        .error(({ update, error }) => update({ name: error.message })),
    })).guest
    expect(result).toBeDefined()
    if (result) {
      expect(typeof result.action).toBe("function")
      expect(typeof result.success).toBe("function")
      expect(typeof result.error).toBe("function")
    }
  })

  test("action может возвращать void, number, массив", () => {
    const actions = createActionsConfig<
      {
        name: ReturnType<typeof types.string.required>
        num: ReturnType<typeof types.number.required>
        arr: ReturnType<typeof types.array.required>
      },
      "void" | "number" | "array"
    >((process) => ({
      void: process()
        .action(() => {})
        .success(({ update }) => update({ name: "ok" })),
      number: process()
        .action(() => 42)
        .success(({ update, data }) => update({ num: data })),
      array: process()
        .action(() => [1, 2, 3])
        .success(({ update, data }) => update({ arr: data })),
    }))
    expect(typeof actions.void?.success).toBe("function")
    expect(typeof actions.number?.success).toBe("function")
    expect(typeof actions.array?.success).toBe("function")
  })

  test("поддержка title и description", () => {
    const actions = createActionsConfig<{ name: ReturnType<typeof types.string.required> }, "guest">((process) => ({
      guest: process({ title: "guest_action", description: "Действие для гостя" })
        .action(({ context }) => context.name)
        .success(({ update, data }) => update({ name: data })),
    }))
    expect(actions.guest?.title, "title должен быть установлен").toBe("guest_action")
    expect(actions.guest?.description, "description должен быть установлен").toBe("Действие для гостя")
  })

  test("title и description опциональны", () => {
    const actions = createActionsConfig<{ name: ReturnType<typeof types.string.required> }, "guest">((process) => ({
      guest: process()
        .action(({ context }) => context.name)
        .success(({ update, data }) => update({ name: data })),
    }))
    expect(actions.guest?.title, "title должен быть undefined, если не задан").toBeUndefined()
    expect(actions.guest?.description, "description должен быть undefined, если не задан").toBeUndefined()
  })
})
