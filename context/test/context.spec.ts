import { describe, it, expect } from "bun:test"
import { types, createContext } from "../index"

describe("Контекст", () => {
  describe("Создание контекста", () => {
    it("проверяет доступ к метаданным через _title", () => {
      const { context } = createContext({
        name: types.string.required("Гость")({ title: "Имя пользователя" }),
        age: types.number.optional()({ title: "Возраст" }),
        isActive: types.boolean.required(true)({ title: "Активен" }),
        role: types.enum("user", "admin", "moderator").required("user")({ title: "Роль" }),
        tags: types.array.optional()({ title: "Теги" }),
        description: types.string.optional(), // без title
      })

      // Проверяем значения
      expect(context.name, "Поле name должно быть 'Гость'").toBe("Гость")
      expect(context.age, "Поле age должно быть null").toBe(null)
      expect(context.isActive, "Поле isActive должно быть true").toBe(true)
      expect(context.role, "Поле role должно быть 'user'").toBe("user")
      expect(context.tags, "Поле tags должно быть null").toBe(null)
      expect(context.description, "Поле description должно быть null").toBe(null)

      // Проверяем метаданные
      expect(context._title.name, "Метаданные name должны быть доступны").toBe("Имя пользователя")
      expect(context._title.age, "Метаданные age должны быть доступны").toBe("Возраст")
      expect(context._title.isActive, "Метаданные isActive должны быть доступны").toBe("Активен")
      expect(context._title.role, "Метаданные role должны быть доступны").toBe("Роль")
      expect(context._title.tags, "Метаданные tags должны быть доступны").toBe("Теги")
      expect(context._title.description, "Метаданные description должны быть пустой строкой").toBe("")

      // Проверяем полный объект _title
      expect(context._title, "Полный объект _title должен содержать все метаданные").toEqual({
        name: "Имя пользователя",
        age: "Возраст",
        isActive: "Активен",
        role: "Роль",
        tags: "Теги",
        description: "",
      })
    })

    it("позволяет изменять заголовки через _title", () => {
      const { context } = createContext({
        name: types.string.required("Гость")({ title: "Имя пользователя" }),
        age: types.number.optional(),
        isActive: types.boolean.required(true),
      })

      // Проверяем начальные значения
      expect(context._title.name, "Начальный заголовок name").toBe("Имя пользователя")
      expect(context._title.age, "Начальный заголовок age должен быть пустой строкой").toBe("")
      expect(context._title.isActive, "Начальный заголовок isActive должен быть пустой строкой").toBe("")

      // Изменяем заголовки
      context._title.name = "Полное имя"
      context._title.age = "Возраст пользователя"
      context._title.isActive = "Статус активности"

      // Проверяем, что заголовки изменились
      expect(context._title.name, "Заголовок name должен измениться").toBe("Полное имя")
      expect(context._title.age, "Заголовок age должен измениться").toBe("Возраст пользователя")
      expect(context._title.isActive, "Заголовок isActive должен измениться").toBe("Статус активности")

      // Проверяем, что значения контекста не изменились
      expect(context.name, "Значение name не должно измениться").toBe("Гость")
      expect(context.age, "Значение age не должно измениться").toBe(null)
      expect(context.isActive, "Значение isActive не должно измениться").toBe(true)

      // Добавляем новый заголовок для несуществующего поля
      ;(context._title as any).newField = "Новый заголовок"
      expect((context._title as any).newField, "Можно добавить заголовок для нового поля").toBe("Новый заголовок")
    })

    it("создаёт контекст с правильными значениями по умолчанию", () => {
      const { context } = createContext({
        name: types.string.required("Гость"),
        role: types.enum("user", "admin", "moderator").required("user"),
        nickname: types.string(),
        bio: types.string.optional(),
        priority: types.enum("low", "medium", "high")(),
        tags: types.array.optional([]),
      })

      expect(context.name, 'Поле name должно быть "Гость" по умолчанию').toBe("Гость")
      expect(context.role, 'Поле role должно быть "user" по умолчанию').toBe("user")
      expect(context.nickname, "Поле nickname должно быть null по умолчанию").toBe(null)
      expect(context.bio, "Поле bio должно быть null по умолчанию").toBe(null)
      expect(context.priority, "Поле priority должно быть null по умолчанию").toBe(null)
      expect(context.tags, "Поле tags должно быть [] по умолчанию").toEqual([])
    })

    it("корректно работает со всеми типами данных", () => {
      const { context } = createContext({
        title: types.string.required("Заголовок"),
        description: types.string(),
        age: types.number.required(18),
        score: types.number(),
        isActive: types.boolean.required(true),
        isVerified: types.boolean(),
        status: types.enum("draft", "published", "archived").required("draft"),
        category: types.enum("tech", "design", "business")(),
        tags: types.array.required([]),
        permissions: types.array(),
        flags: types.array(),
      })

      expect(context.title, 'Поле title должно быть "Заголовок" по умолчанию').toBe("Заголовок")
      expect(context.description, "Поле description должно быть null по умолчанию").toBe(null)
      expect(context.age, "Поле age должно быть 18 по умолчанию").toBe(18)
      expect(context.score, "Поле score должно быть null по умолчанию").toBe(null)
      expect(context.isActive, "Поле isActive должно быть true по умолчанию").toBe(true)
      expect(context.isVerified, "Поле isVerified должно быть null по умолчанию").toBe(null)
      expect(context.status, 'Поле status должно быть "draft" по умолчанию').toBe("draft")
      expect(context.category, "Поле category должно быть null по умолчанию").toBe(null)
      expect(context.tags, "Поле tags должно быть [] по умолчанию").toEqual([])
      expect(context.permissions, "Поле permissions должно быть null по умолчанию").toBe(null)
      expect(context.flags, "Поле flags должно быть null по умолчанию").toBe(null)
    })

    it("проверяет новый chainable API с title", () => {
      const { context } = createContext({
        name: types.string.required("Гость")({ title: "Имя пользователя" }),
        role: types.enum("user", "admin", "moderator").required("user")({ title: "Роль" }),
        nickname: types.string("Nic")({ title: "Псевдоним" }),
      })

      expect(context.name, 'Поле name должно быть "Гость" по умолчанию').toBe("Гость")
      expect(context.role, 'Поле role должно быть "user" по умолчанию').toBe("user")
      expect(context.nickname, 'Поле nickname должно быть "Nic" по умолчанию').toBe("Nic")
    })

    it("проверяет типизацию enum", () => {
      const { context } = createContext({
        role: types.enum("user", "admin")(),
      })
      expect(context.role, "Поле role должно быть null по умолчанию").toBe(null)

      // @ts-expect-error - enum должен принимать только строки
      types.enum(true, false)()
      // @ts-expect-error - enum должен принимать только строки
      types.enum({})()
    })

    it("проверяет типизацию array", () => {
      const { context } = createContext({
        tags: types.array(["a", "b"]),
        numbers: types.array(),
        flags: types.array(),
      })
      expect(context.tags, 'Поле tags должно быть ["a", "b"] по умолчанию').toEqual(["a", "b"])
      expect(context.numbers, "Поле numbers должно быть null по умолчанию").toBe(null)
      expect(context.flags, "Поле flags должно быть null по умолчанию").toBe(null)

      // @ts-ignore - array должен принимать только примитивы
      types.array([{}])
    })
  })

  describe("Иммутабельность", () => {
    it("запрещает прямое изменение значений", () => {
      const { context } = createContext({
        name: types.string.required("Гость"),
        status: types.enum("start", "process", "end").required("start"),
      })

      expect(() => {
        ;(context as any).name = "Новое имя"
      }, "Должна быть ошибка при прямом изменении поля name").toThrow("Прямое изменение контекста запрещено")

      expect(() => {
        ;(context as any).status = "process"
      }, "Должна быть ошибка при прямом изменении поля status").toThrow("Прямое изменение контекста запрещено")

      expect(() => {
        ;(context as any).newField = "значение"
      }, "Должна быть ошибка при прямом добавлении нового поля").toThrow("Прямое изменение контекста запрещено")
    })

    it("запрещает удаление свойств", () => {
      const { context } = createContext({
        name: types.string.required("Гость"),
        status: types.enum("start", "process", "end").required("start"),
      })

      expect(() => {
        delete (context as any).name
      }, "Должна быть ошибка при удалении поля name").toThrow("Удаление свойств контекста запрещено")

      expect(() => {
        delete (context as any).status
      }, "Должна быть ошибка при удалении поля status").toThrow("Удаление свойств контекста запрещено")
    })

    it("позволяет читать значения", () => {
      const { context } = createContext({
        name: types.string.required("Гость"),
        status: types.enum("start", "process", "end").required("start"),
      })

      expect(context.name, 'Поле name должно быть "Гость"').toBe("Гость")
      expect(context.status, 'Поле status должно быть "start"').toBe("start")
    })
  })
})

describe("Дефолтные значения", () => {
  describe("string", () => {
    it("required с default", () => {
      const { context } = createContext({
        s: types.string.required("abc"),
      })
      expect(context.s, "Поле s должно быть 'abc'").toBe("abc")
    })
    it("required без default", () => {
      const { context } = createContext({
        s: types.string.required(),
      })
      expect(context.s, "Поле s должно быть пустой строкой по умолчанию").toBe("")
    })
    it("optional с default", () => {
      const { context } = createContext({
        s: types.string.optional("zzz"),
      })
      expect(context.s, "Поле s должно быть 'zzz'").toBe("zzz")
    })
    it("optional без default", () => {
      const { context } = createContext({
        s: types.string.optional(),
      })
      expect(context.s, "Поле s должно быть null по умолчанию").toBe(null)
      expect(context._title.s, "Метаданные title должны быть пустой строкой когда не указаны").toBe("")
    })
    it("chainable с title", () => {
      const { context } = createContext({
        s: types.string.required("abc")({ title: "Строка" }),
      })
      expect(context.s, "Поле s должно быть 'abc'").toBe("abc")
      expect(context._title.s, "Метаданные title должны быть доступны через _title").toBe("Строка")
    })
  })

  describe("number", () => {
    it("required с default", () => {
      const { context } = createContext({
        n: types.number.required(42),
      })
      expect(context.n, "Поле n должно быть 42").toBe(42)
    })
    it("required без default", () => {
      const { context } = createContext({
        n: types.number.required(),
      })
      expect(context.n, "Поле n должно быть 0 по умолчанию").toBe(0)
    })
    it("optional с default", () => {
      const { context } = createContext({
        n: types.number.optional(7),
      })
      expect(context.n, "Поле n должно быть 7").toBe(7)
    })
    it("optional без default", () => {
      const { context } = createContext({
        n: types.number.optional(),
      })
      expect(context.n, "Поле n должно быть null по умолчанию").toBe(null)
    })
  })

  describe("boolean", () => {
    it("required с default", () => {
      const { context } = createContext({
        b: types.boolean.required(true),
      })
      expect(context.b, "Поле b должно быть true").toBe(true)
    })
    it("required без default", () => {
      const { context } = createContext({
        b: types.boolean.required(),
      })
      expect(context.b, "Поле b должно быть false по умолчанию").toBe(false)
    })
    it("optional с default", () => {
      const { context } = createContext({
        b: types.boolean.optional(false),
      })
      expect(context.b, "Поле b должно быть false").toBe(false)
    })
    it("optional без default", () => {
      const { context } = createContext({
        b: types.boolean.optional(),
      })
      expect(context.b, "Поле b должно быть null по умолчанию").toBe(null)
    })
  })

  describe("array", () => {
    it("required с default", () => {
      const { context } = createContext({
        a: types.array.required([1, 2, 3]),
      })
      expect(context.a, "Поле a должно быть [1, 2, 3]").toEqual([1, 2, 3])
    })
    it("required без default", () => {
      const { context } = createContext({
        a: types.array.required(),
      })
      expect(context.a, "Поле a должно быть пустым массивом по умолчанию").toEqual([])
    })
    it("optional с default", () => {
      const { context } = createContext({
        a: types.array.optional(["x"]),
      })
      expect(context.a, "Поле a должно быть ['x']").toEqual(["x"])
    })
    it("optional без default", () => {
      const { context } = createContext({
        a: types.array.optional(),
      })
      expect(context.a, "Поле a должно быть null по умолчанию").toBe(null)
    })
  })

  describe("enum", () => {
    it("required с default", () => {
      const { context } = createContext({
        e: types.enum("a", "b", "c").required("b"),
      })
      expect(context.e, "Поле e должно быть 'b'").toBe("b")
    })
    it("required без default", () => {
      const { context } = createContext({
        e: types.enum("a", "b").required(),
      })
      expect(context.e, "Поле e должно быть 'a' по умолчанию").toBe("a")
    })
    it("optional с default", () => {
      const { context } = createContext({
        e: types.enum("x", "y").optional("y"),
      })
      expect(context.e, "Поле e должно быть 'y'").toBe("y")
    })
    it("optional без default", () => {
      const { context } = createContext({
        e: types.enum("x", "y").optional(),
      })
      expect(context.e, "Поле e должно быть null по умолчанию").toBe(null)
    })
  })

  describe("edge cases", () => {
    it("string required пустая строка", () => {
      const { context } = createContext({
        s: types.string.required(""),
      })
      expect(context.s, "Поле s должно быть пустой строкой").toBe("")
    })
    it("array required пустой массив", () => {
      const { context } = createContext({
        a: types.array.required([]),
      })
      expect(context.a, "Поле a должно быть пустым массивом").toEqual([])
    })
    it("enum required первый элемент", () => {
      const { context } = createContext({
        e: types.enum("foo", "bar").required(),
      })
      expect(context.e, "Поле e должно быть 'foo' по умолчанию").toBe("foo")
    })
  })
})

describe("Примеры использования", () => {
  it("пользовательский контекст", () => {
    const schema = {
      name: types.string.required("Гость")({ title: "Имя пользователя" }),
      age: types.number.optional(),
      isActive: types.boolean.required(true),
      role: types.enum("user", "admin", "moderator").required("user")({ title: "Роль" }),
      tags: types.array.optional(),
    }
    const { context, update } = createContext(schema)

    expect(context.name).toBe("Гость")
    expect(context.age).toBe(null)
    expect(context.isActive).toBe(true)
    expect(context.role).toBe("user")
    expect(context.tags).toBe(null)

    const updated = update({ name: "Иван", age: 25 })
    expect(updated, "После update должны вернуться только обновленные поля").toEqual({
      name: "Иван",
      age: 25,
    })

    // Проверяем доступ к метаданным
    expect(context._title.name, "Метаданные name должны быть доступны").toBe("Имя пользователя")
    expect(context._title.role, "Метаданные role должны быть доступны").toBe("Роль")
    expect(context._title.age, "Метаданные age должны быть пустой строкой").toBe("")
    expect(context._title.isActive, "Метаданные isActive должны быть пустой строкой").toBe("")
    expect(context._title.tags, "Метаданные tags должны быть пустой строкой").toBe("")
  })

  it("контекст продукта", () => {
    const schema = {
      id: types.string.required(),
      name: types.string.required("Новый продукт"),
      price: types.number.required(0),
      inStock: types.boolean.required(false),
      category: types.enum("electronics", "clothing", "books").optional(),
      images: types.array.required([]),
    }
    const { context, update } = createContext(schema)

    expect(context.id).toBe("")
    expect(context.name).toBe("Новый продукт")
    expect(context.price).toBe(0)
    expect(context.inStock).toBe(false)
    expect(context.category).toBe(null)
    expect(context.images).toEqual([])

    const updated = update({
      id: "prod-123",
      name: "iPhone 15",
      price: 99999,
      inStock: true,
      category: "electronics",
    })
    expect(updated, "После update должны вернуться только обновленные поля").toEqual({
      id: "prod-123",
      name: "iPhone 15",
      price: 99999,
      inStock: true,
      category: "electronics",
    })
  })

  it("контекст статьи", () => {
    const schema = {
      title: types.string.required("Заголовок"),
      content: types.string.optional(),
      published: types.boolean.required(false),
      views: types.number.required(0),
    }
    const { context, update } = createContext(schema)

    expect(context.title).toBe("Заголовок")
    expect(context.content).toBe(null)
    expect(context.published).toBe(false)
    expect(context.views).toBe(0)

    const updated = update({
      title: "Новый заголовок",
      content: "Содержание статьи",
      published: true,
    })
    expect(updated, "После update должны вернуться только обновленные поля").toEqual({
      title: "Новый заголовок",
      content: "Содержание статьи",
      published: true,
    })
  })
})

describe("getSnapshot", () => {
  it("возвращает снимок текущего состояния контекста", () => {
    const { context, getSnapshot } = createContext({
      name: types.string.required("Гость"),
      age: types.number.optional(),
      isActive: types.boolean.required(true),
      role: types.enum("user", "admin").required("user"),
      tags: types.array.optional(),
    })

    // Проверяем начальный снимок
    expect(getSnapshot(), "Снимок должен содержать начальные значения").toEqual({
      name: "Гость",
      age: null,
      isActive: true,
      role: "user",
      tags: null,
    })

    // Проверяем, что снимок идентичен контексту
    expect(getSnapshot()).toEqual({
      name: context.name,
      age: context.age,
      isActive: context.isActive,
      role: context.role,
      tags: context.tags,
    })
  })

  it("отражает изменения в контексте", () => {
    const { context, update, getSnapshot } = createContext({
      name: types.string.required("Гость"),
      age: types.number.optional(),
      isActive: types.boolean.required(true),
    })

    // Начальный снимок
    const initialSnapshot = getSnapshot()
    expect(initialSnapshot.name).toBe("Гость")
    expect(initialSnapshot.age).toBe(null)
    expect(initialSnapshot.isActive).toBe(true)

    // Обновляем контекст
    update({ name: "Иван", age: 25 })

    // Новый снимок должен отразить изменения
    const newSnapshot = getSnapshot()
    expect(newSnapshot.name, "Снимок должен отразить изменение name").toBe("Иван")
    expect(newSnapshot.age, "Снимок должен отразить изменение age").toBe(25)
    expect(newSnapshot.isActive, "Снимок должен сохранить неизмененное поле").toBe(true)

    // Проверяем, что снимок идентичен обновленному контексту
    expect(newSnapshot).toEqual({
      name: context.name,
      age: context.age,
      isActive: context.isActive,
    })

    // Старый снимок остается неизменным
    expect(initialSnapshot.name).toBe("Гость")
    expect(initialSnapshot.age).toBe(null)
  })

  it("работает со всеми типами данных", () => {
    const { context, update, getSnapshot } = createContext({
      title: types.string.required("Заголовок"),
      description: types.string(),
      age: types.number.required(18),
      score: types.number(),
      isActive: types.boolean.required(true),
      isVerified: types.boolean(),
      status: types.enum("draft", "published", "archived").required("draft"),
      category: types.enum("tech", "design", "business")(),
      tags: types.array.required([]),
      permissions: types.array(),
    })

    // Проверяем начальный снимок
    expect(getSnapshot()).toEqual({
      title: "Заголовок",
      description: null,
      age: 18,
      score: null,
      isActive: true,
      isVerified: null,
      status: "draft",
      category: null,
      tags: [],
      permissions: null,
    })

    // Обновляем все поля
    update({
      title: "Новый заголовок",
      description: "Новое описание",
      age: 25,
      score: 100,
      isActive: false,
      isVerified: true,
      status: "published",
      category: "tech",
      tags: ["typescript", "library"],
      permissions: [1, 2, 3],
    })

    // Проверяем обновленный снимок
    const updatedSnapshot = getSnapshot()
    expect(updatedSnapshot).toEqual({
      title: "Новый заголовок",
      description: "Новое описание",
      age: 25,
      score: 100,
      isActive: false,
      isVerified: true,
      status: "published",
      category: "tech",
      tags: ["typescript", "library"],
      permissions: [1, 2, 3],
    })
  })

  it("снимок доступен только для чтения", () => {
    const { getSnapshot } = createContext({
      name: types.string.required("Гость"),
      age: types.number.optional(),
    })

    // Проверяем, что снимок доступен только для чтения
    const snapshot = getSnapshot()
    expect(() => {
      ;(snapshot as any).name = "Новое имя"
    }, "Попытка изменения снимка должна вызвать ошибку").toThrow()

    expect(() => {
      ;(snapshot as any).newField = "значение"
    }, "Попытка добавления нового поля в снимок должна вызвать ошибку").toThrow()

    expect(() => {
      delete (snapshot as any).name
    }, "Попытка удаления поля из снимка должна вызвать ошибку").toThrow()

    // Проверяем, что значения не изменились
    expect(snapshot.name).toBe("Гость")
    expect(snapshot.age).toBe(null)
  })

  it("снимок является отдельным объектом", () => {
    const { context, update, getSnapshot } = createContext({
      name: types.string.required("Гость"),
      age: types.number.optional(),
    })

    // Получаем снимок
    const currentSnapshot = getSnapshot()

    // Обновляем контекст
    update({ name: "Иван", age: 25 })

    // Новый снимок должен отразить изменения
    const newSnapshot = getSnapshot()
    expect(newSnapshot.name).toBe("Иван")
    expect(newSnapshot.age).toBe(25)

    // Старый снимок остается неизменным (это копия)
    expect(currentSnapshot.name).toBe("Гость")
    expect(currentSnapshot.age).toBe(null)
  })

  it("снимок экспортируется из createContext", () => {
    const { context, update, onUpdate, schema, getSnapshot } = createContext({
      name: types.string.required("Гость"),
      age: types.number.optional(),
    })

    // Проверяем, что getSnapshot доступен
    expect(getSnapshot, "getSnapshot должен быть доступен").toBeDefined()
    expect(typeof getSnapshot, "getSnapshot должен быть функцией").toBe("function")

    // Проверяем начальные значения
    const snapshot = getSnapshot()
    expect(snapshot.name).toBe("Гость")
    expect(snapshot.age).toBe(null)

    // Обновляем и проверяем
    update({ name: "Иван" })
    const updatedSnapshot = getSnapshot()
    expect(updatedSnapshot.name).toBe("Иван")
  })
})
