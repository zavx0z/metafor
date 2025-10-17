// core/fields.test.ts
import { describe, it, expect, beforeEach } from "bun:test"
import { Fields } from "./fields"
import type { Actor } from "../actor"

const A = (id: string, payload?: unknown): Actor => ({ id, payload } as unknown as Actor)

describe("Fields (лексикографический порядок)", () => {
  let fields: Fields

  beforeEach(() => {
    // каждый тест — чистый экземпляр
    fields = Fields.get()
    // Сбрасываем синглтон в чистый инстанс
    Fields.set(new (Fields as any)())
    fields = Fields.get()
  })

  it("createChildren: создаёт актора в корне и добавляет по порядку", () => {
    fields.createChildren(null, A("a"))
    fields.createChildren(null, A("b"))
    fields.createChildren(null, A("c"))

    const root = fields.getChildren(null)
    expect(root).toEqual(["a", "b", "c"])
    expect(fields.getActor("b")?.id).toBe("b")
  })

  it("createBefore/createAfter: вставка перед/после соседа", () => {
    fields.createChildren(null, A("a"))
    fields.createChildren(null, A("c"))

    fields.createBefore("c", A("b"))
    expect(fields.getChildren(null)).toEqual(["a", "b", "c"])

    fields.createAfter("b", A("b2"))
    expect(fields.getChildren(null)).toEqual(["a", "b", "b2", "c"])
  })

  it("createBetween: вставка между левым и правым соседями", () => {
    fields.createChildren(null, A("a"))
    fields.createChildren(null, A("c"))
    fields.createBetween("a", "c", A("b"))
    expect(fields.getChildren(null)).toEqual(["a", "b", "c"])
  })

  it("insertBefore/insertAfter: перемещение существующего узла", () => {
    fields.createChildren(null, A("a"))
    fields.createChildren(null, A("b"))
    fields.createChildren(null, A("c"))

    fields.insertBefore("a", "c")
    expect(fields.getChildren(null)).toEqual(["c", "a", "b"])

    fields.insertAfter("a", "c")
    expect(fields.getChildren(null)).toEqual(["a", "c", "b"])
  })

  it("insertBetween: перемещение между соседями (оба/один/null)", () => {
    fields.createChildren(null, A("a"))
    fields.createChildren(null, A("b"))
    fields.createChildren(null, A("c"))

    // между a и c — встанет посередине
    fields.insertBetween("a", "c", "b")
    expect(fields.getChildren(null)).toEqual(["a", "b", "c"])

    // (null, a) -> в начало
    fields.insertBetween(null, "a", "c")
    expect(fields.getChildren(null)).toEqual(["c", "a", "b"])

    // (b, null) -> в конец
    fields.insertBetween("b", null, "c")
    expect(fields.getChildren(null)).toEqual(["a", "b", "c"])
  })

  it("appendChild: перемещение в конец к новому родителю (reparent)", () => {
    fields.createChildren(null, A("p")) // родитель
    fields.createChildren("p", A("x"))
    fields.createChildren("p", A("y"))
    fields.createChildren(null, A("q")) // другой родитель
    fields.createChildren("q", A("z"))

    // переместить x из p в q (в конец)
    fields.appendChild("q", "x")
    expect(fields.getChildren("p")).toEqual(["y"])
    expect(fields.getChildren("q")).toEqual(["z", "x"])
  })

  it("moveBefore/moveAfter: сахар над insertBefore/insertAfter", () => {
    fields.createChildren(null, A("a"))
    fields.createChildren(null, A("b"))
    fields.createChildren(null, A("c"))

    fields.moveAfter("a", "c")
    expect(fields.getChildren(null)).toEqual(["a", "c", "b"])

    fields.moveBefore("a", "c")
    expect(fields.getChildren(null)).toEqual(["c", "a", "b"])
  })

  it("reparentActor: start/end/after варианты позиционирования", () => {
    fields.createChildren(null, A("p"))
    fields.createChildren("p", A("a"))
    fields.createChildren("p", A("b"))
    fields.createChildren("p", A("c"))

    // end (по умолчанию): переносим 'a' к корню в конец
    fields.reparentActor(null, "a", { at: "end" })
    expect(fields.getChildren("p")).toEqual(["b", "c"])
    expect(fields.getChildren(null)).toEqual(["p", "a"])

    // start: вернём 'a' к 'p' в начало
    fields.reparentActor("p", "a", { at: "start" })
    expect(fields.getChildren("p")).toEqual(["a", "b", "c"])

    // after: перенести 'a' сразу после 'b'
    fields.reparentActor("p", "a", { at: "after", after: "b" })
    expect(fields.getChildren("p")).toEqual(["b", "a", "c"])
  })

  it("createNode(path): создание строго по индекс-пути", () => {
    // создаём корневых детей в позиции 0 и 1
    fields.createNode("0", A("a"))
    fields.createNode("1", A("b"))
    expect(fields.getChildren(null)).toEqual(["a", "b"])

    // создаём ребёнка у 'a' в позицию 0
    fields.createNode("0/0", A("a0"))
    expect(fields.getChildren("a")).toEqual(["a0"])

    // создание в середину на корне
    fields.createNode("1", A("x")) // сдвигает старого "b" вправо за счёт вставки перед соседом
    expect(fields.getChildren(null)).toEqual(["a", "x", "b"])
  })

  it("getNode/hasPath/getIdByIndexPath: адресация по индекс-пути", () => {
    fields.createChildren(null, A("a"))
    fields.createChildren(null, A("b"))
    fields.createChildren("a", A("a0"))
    fields.createChildren("a", A("a1"))

    expect(fields.hasPath("0")).toBeTrue()
    expect(fields.hasPath("1")).toBeTrue()
    expect(fields.hasPath("2")).toBeFalse()

    expect(fields.getNode("0")?.id).toBe("a")
    expect(fields.getNode("1")?.id).toBe("b")
    expect(fields.getNode("0/1")?.id).toBe("a1")

    const id = fields.getIdByIndexPath(null, [0, 0])
    expect(id).toBe("a0")
  })

  it("unlink: отвязка без удаления из арены", () => {
    fields.createChildren(null, A("p"))
    fields.createChildren("p", A("x"))
    expect(fields.getChildren("p")).toEqual(["x"])

    fields.unlink("x")
    expect(fields.getChildren("p")).toEqual([])
    // актор остался
    expect(fields.getActor("x")?.id).toBe("x")
  })

  it("remove: удаление одиночного и recursive-поддерева", () => {
    fields.createChildren(null, A("p"))
    fields.createChildren("p", A("a"))
    fields.createChildren("p", A("b"))
    fields.createChildren("a", A("a0"))

    // удаляем 'b' (без рекурсии)
    fields.remove("b")
    expect(fields.getChildren("p")).toEqual(["a"])
    expect(fields.getActor("b")).toBeNull()

    // удаляем 'a' рекурсивно (с потомком 'a0')
    fields.remove("a", true)
    expect(fields.getChildren("p")).toEqual([])
    expect(fields.getActor("a")).toBeNull()
    expect(fields.getActor("a0")).toBeNull()
  })

  it("плотные многократные вставки между теми же соседями — стабильный порядок", () => {
    fields.createChildren(null, A("L"))
    fields.createChildren(null, A("R"))

    // Будем многократно вставлять между L и R
    for (let i = 0; i < 50; i++) {
      fields.createBetween("L", "R", A(`X${i}`))
    }
    const kids = fields.getChildren(null)
    expect(kids[0]).toBe("L")
    expect(kids[kids.length - 1]).toBe("R")
    // Проверим, что все X* на месте и их количество верное
    const middle = kids.slice(1, -1)
    expect(middle.length).toBe(50)
    expect(new Set(middle).size).toBe(50)
  })

  // ----- Ошибочные ситуации -----

  it("ошибка: createChildren с повторным id", () => {
    fields.createChildren(null, A("dup"))
    expect(() => fields.createChildren(null, A("dup"))).toThrow("Актор уже существует: dup")
  })

  it("createNode(path) при занятом индексе — это вставка перед соседом", () => {
    fields.createNode("0", A("a"))
    fields.createNode("0", A("x")) // вставка в голову
    expect(fields.getChildren(null)).toEqual(["x", "a"])
  })

  it("ошибка: insertBetween с соседями из разных родителей", () => {
    fields.createChildren(null, A("p1"))
    fields.createChildren(null, A("p2"))
    fields.createChildren("p1", A("a"))
    fields.createChildren("p2", A("b"))
    fields.createChildren(null, A("x"))

    expect(() => fields.insertBetween("a", "b", "x")).toThrow("Соседи должны иметь одного родителя")
  })

  it("ошибка: insertBefore/After когда сосед не в витрине родителя", () => {
    fields.createChildren(null, A("p"))
    fields.createChildren(null, A("lonely"))
    fields.createChildren("p", A("a"))
    fields.createChildren("p", A("b"))
    fields.createChildren("p", A("c"))

    // удалим 'b' из витрины вручную: unlink
    fields.unlink("b")
    expect(() => fields.insertBefore("b", "c")).toThrow("Сосед отсутствует в витрине своего родителя: b")
    expect(() => fields.insertAfter("b", "a")).toThrow("Сосед отсутствует в витрине своего родителя: b")
  })

  it("ошибка: appendChild/insert* для неизвестного актора", () => {
    expect(() => fields.appendChild(null, "nope")).toThrow("Актор не найден: nope")
    expect(() => fields.insertBetween(null, null, "nope")).toThrow("Актор не найден: nope")
  })

  it("createNode(path) создаёт в середину (вставка перед соседом), и индекс-путь корректно разрешается", () => {
    fields.createNode("0", A("a"))
    fields.createNode("1", A("c"))
    fields.createNode("1", A("b")) // сейчас должно стать ["a","b","c"]
    expect(fields.getChildren(null)).toEqual(["a", "b", "c"])

    // создать у 'b' первого ребёнка
    fields.createNode("1/0", A("b0"))
    expect(fields.getChildren("b")).toEqual(["b0"])
  })
  it("unlink на корне: удаляет из корневой витрины и актор остаётся в арене", () => {
    const fields = Fields.get()
    fields.createChildren(null, A("a"))
    fields.createChildren(null, A("b"))
    fields.createChildren(null, A("c"))

    // отвязка 'b' из корня
    fields.unlink("b")
    expect(fields.getChildren(null)).toEqual(["a", "c"])
    // сам актор 'b' не удалён
    expect(fields.getActor("b")?.id).toBe("b")

    // можно вернуть его обратно (после 'a')
    fields.insertAfter("a", "b")
    expect(fields.getChildren(null)).toEqual(["a", "b", "c"])
  })

  it("createNode в начало: вставка на индекс 0 сдвигает соседей вправо", () => {
    const fields = Fields.get()

    // создаём "a" на 0 → ["a"]
    fields.createNode("0", A("a"))
    expect(fields.getChildren(null)).toEqual(["a"])

    // вставка "x" на 0 → ["x","a"]
    fields.createNode("0", A("x"))
    expect(fields.getChildren(null)).toEqual(["x", "a"])

    // вставка "y" на 0 → ["y","x","a"]
    fields.createNode("0", A("y"))
    expect(fields.getChildren(null)).toEqual(["y", "x", "a"])

    // для контроля: вставка "b" на 2 → между "x" и "a"
    fields.createNode("2", A("b"))
    expect(fields.getChildren(null)).toEqual(["y", "x", "b", "a"])
  })
  // ===== no-op и самоссылки =====
  it("insertBefore/insertAfter с тем же childId — no-op (порядок не меняется)", () => {
    const fields = Fields.get()
    fields.createChildren(null, A("a"))
    fields.createChildren(null, A("b"))
    fields.createChildren(null, A("c"))

    fields.insertBefore("b", "b")
    expect(fields.getChildren(null)).toEqual(["a", "b", "c"])

    fields.insertAfter("b", "b")
    expect(fields.getChildren(null)).toEqual(["a", "b", "c"])
  })

  it("insertBetween с участием самого childId не ломает порядок", () => {
    const fields = Fields.get()
    fields.createChildren(null, A("a"))
    fields.createChildren(null, A("b"))
    fields.createChildren(null, A("c"))
    // 'b' уже между 'a' и 'c' — операция должна быть идемпотентна
    fields.insertBetween("a", "c", "b")
    expect(fields.getChildren(null)).toEqual(["a", "b", "c"])
  })

  // ===== reparent: корректность 'after' =====
  it("reparentActor: 'after' должен принадлежать новому родителю (рекомендуем кидать ошибку)", () => {
    const fields = Fields.get()
    fields.createChildren(null, A("p1"))
    fields.createChildren(null, A("p2"))
    fields.createChildren("p1", A("x"))
    fields.createChildren("p2", A("y"))
    fields.createChildren(null, A("m"))

    // РЕКОМЕНДУЕМАЯ СЕМАНТИКА: 'after' не из newParentId → ошибка.
    // Если ты добавишь в Fields проверку принадлежности — этот тест будет валиден.
    // Сейчас (без проверки) поведение может «утащить» в родителя 'after'.
    // Тогда этот тест лучше пометить .todo или временно ожидать текущее поведение.
    expect(() => fields.reparentActor("p1", "m", { at: "after", after: "y" })).toThrow() // добавь явную проверку и понятное сообщение в reparentActor
  })

  // ===== индексы путей: валидация и границы =====
  it("createNode: невалидный путь (символ) -> ошибка", () => {
    const fields = Fields.get()
    expect(() => fields.createNode("0/a", A("bad"))).toThrow(/Некорректный индекс/)
  })

  it("createNode: отрицательный индекс -> ошибка", () => {
    const fields = Fields.get()
    expect(() => fields.createNode("-1", A("neg"))).toThrow(/Некорректный индекс/)
  })

  it("createNode: индекс вне диапазона -> ошибка", () => {
    const fields = Fields.get()
    fields.createNode("0", A("a"))
    // длина корневых детей = 1, индекс 5 — вне диапазона
    expect(() => fields.createNode("5", A("oob"))).toThrow(/Индекс вне диапазона/)
  })

  it("getIdByIndexPath: от непустого корня", () => {
    const fields = Fields.get()
    fields.createChildren(null, A("root"))
    fields.createChildren("root", A("a"))
    fields.createChildren("root", A("b"))
    const id = fields.getIdByIndexPath("root", [1]) // второй ребёнок
    expect(id).toBe("b")
  })

  // ===== стабильность ключей при плотных вставках =====
  it("много вставок в голову: порядок стабильный, без деградации", () => {
    const fields = Fields.get()
    const N = 200
    for (let i = 0; i < N; i++) {
      fields.createNode("0", A(`n${i}`))
    }
    const kids = fields.getChildren(null)
    expect(kids.length).toBe(N)
    // Последний вставленный должен стоять в голове
    expect(kids[0]).toBe(`n${N - 1}`)
    // Уникальность id
    expect(new Set(kids).size).toBe(N)
  })

  it("много вставок в хвост: append последовательный и корректный", () => {
    const fields = Fields.get()
    const N = 200
    for (let i = 0; i < N; i++) {
      fields.createChildren(null, A(`m${i}`))
    }
    const kids = fields.getChildren(null)
    expect(kids.length).toBe(N)
    expect(kids[0]).toBe("m0")
    expect(kids[N - 1]).toBe(`m${N - 1}`)
  })

  // ===== сложное дерево: перенос между уровнями =====
  it("перенос между уровнями: из глубины на корень и обратно с сохранением порядка", () => {
    const fields = Fields.get()
    fields.createChildren(null, A("p"))
    fields.createChildren("p", A("a"))
    fields.createChildren("p", A("b"))
    fields.createChildren("a", A("a0"))
    fields.createChildren("a", A("a1"))

    // перенесём 'a1' на корень в конец
    fields.appendChild(null, "a1")
    expect(fields.getChildren(null)).toEqual(["p", "a1"])
    expect(fields.getChildren("a")).toEqual(["a0"])

    // вернём 'a1' под 'p' после 'a'
    fields.reparentActor("p", "a1", { at: "after", after: "a" })
    expect(fields.getChildren("p")).toEqual(["a", "a1", "b"])
  })
  // it("Actor.createSibling создаёт брата после/перед целевым актором", () => {
  //   const meta = {
  //     name: "test",
  //     desc: "",
  //     context: {},
  //     states: { IDLE: {} },
  //     processes: {},
  //     reactions: {},
  //     render: [],
  //     core: {},
  //   }
  //   const a = Actor.fromSchema({ meta, id: "a" })
  //   const b = Actor.createSibling(a, { meta, id: "b" })
  //   const c = Actor.createSibling(a, { meta, id: "c", at: "before" })

  //   const fields = Fields.get()
  //   expect(fields.getChildren(null)).toEqual(["c", "a", "b"])
  // })
})
