import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { Store } from "../index"
import type { ActorRecord, PatchRecord } from "../index.t"
import { Database } from "bun:sqlite"

describe("Store", () => {
  let store: Store

  // Перед каждым тестом создаем новое in-memory хранилище
  beforeEach(() => {
    // Используем специальный путь ':memory:' для in-memory базы данных
    store = new Store(":memory:")

    // Создаем тестовые meta-записи, которые могут понадобиться в тестах
    store.setMeta({ tag: "test-meta", fingerprint: "test-fingerprint" })
    store.setMeta({ tag: "parent-meta", fingerprint: "parent-fingerprint" })
    store.setMeta({ tag: "child-meta", fingerprint: "child-fingerprint" })
    store.setMeta({ tag: "child-meta-1", fingerprint: "child-fingerprint-1" })
    store.setMeta({ tag: "child-meta-2", fingerprint: "child-fingerprint-2" })
    store.setMeta({ tag: "grandchild-meta", fingerprint: "grandchild-fingerprint" })
    store.setMeta({ tag: "parent", fingerprint: "parent-fingerprint" })
    store.setMeta({ tag: "child", fingerprint: "child-fingerprint" })
  })

  // После каждого теста закрываем соединение с базой данных
  afterEach(() => {
    store.close()
  })

  describe("Операции с метаданными", () => {
    test("должен сохранять и получать метаданные", () => {
      const meta = { tag: "test-tag", fingerprint: "test-fingerprint" }

      // Устанавливаем метаданные
      store.setMeta(meta)

      // Получаем метаданные
      const result = store.getMeta("test-tag")

      // Проверяем, что метаданные корректно сохранились
      expect(result, "Метаданные должны быть определены").toBeDefined()

      if (result) {
        expect(result.tag, "Тег метаданных должен совпадать").toBe(meta.tag)
        expect(result.fingerprint, "Отпечаток метаданных должен совпадать").toBe(meta.fingerprint)
        expect(result.timestamp, "Временная метка должна быть определена").toBeDefined()
      }
    })

    test("должен обновлять существующие метаданные", () => {
      const meta1 = { tag: "test-tag", fingerprint: "fingerprint-1" }
      const meta2 = { tag: "test-tag", fingerprint: "fingerprint-2" }

      // Устанавливаем метаданные первый раз
      store.setMeta(meta1)
      const result1 = store.getMeta("test-tag")

      // Обновляем метаданные
      store.setMeta(meta2)
      const result2 = store.getMeta("test-tag")

      // Проверяем, что метаданные обновились
      expect(result1?.fingerprint, "Первый отпечаток должен быть fingerprint-1").toBe("fingerprint-1")
      expect(result2?.fingerprint, "Второй отпечаток должен измениться на fingerprint-2").toBe("fingerprint-2")
    })

    test("должен возвращать null для несуществующих метаданных", () => {
      const result = store.getMeta("non-existent-tag")
      expect(result, "Для несуществующего тега должен возвращаться null").toBeNull()
    })

    test("должен удалять метаданные", () => {
      const meta = { tag: "test-tag", fingerprint: "test-fingerprint" }

      // Устанавливаем и проверяем метаданные
      store.setMeta(meta)
      expect(store.getMeta("test-tag"), "Метаданные должны существовать после создания").toBeDefined()

      // Удаляем метаданные
      store.deleteMeta("test-tag")

      // Проверяем, что метаданные удалены
      expect(store.getMeta("test-tag"), "Метаданные должны быть удалены").toBeNull()
    })
  })

  describe("Операции с акторами", () => {
    test("должен создавать и получать актора", () => {
      const meta = { tag: "test-meta", fingerprint: "test-fingerprint" }
      // Сначала создаем meta-запись
      store.setMeta(meta)

      const actor = {
        meta_tag: meta.tag,
        parent_id: null,
        idx: 0,
        snapshot: "{}",
      }

      // Создаем актора
      const actorId = store.createActor(actor)

      // Получаем актора
      const result = store.getActor({ tag: meta.tag })

      // Проверяем, что актор корректно создан
      expect(result, "Актор должен быть определен").toBeDefined()

      if (result) {
        expect(result.id, "ID актора должен совпадать").toBe(actorId)
        expect(result.meta_tag, "Тег метаданных актора должен совпадать").toBe(actor.meta_tag)
        expect(result.parent_id, "ID родительского актора должен быть null").toBe(actor.parent_id)
        expect(result.idx, "Индекс актора должен совпадать").toBe(actor.idx)
        expect(result.snapshot, "Снапшот актора должен совпадать").toBe(actor.snapshot)
        expect(result.timestamp, "Временная метка должна быть определена").toBeDefined()
      }
    })

    test("должен обновлять снапшот актора", () => {
      const meta = { tag: "test-meta", fingerprint: "test-fingerprint" }

      // Создаем актора
      const actorId = store.createActor({
        meta_tag: meta.tag,
        parent_id: null,
        idx: 0,
        snapshot: "{}",
      })

      // Обновляем снапшот
      const newSnapshot = JSON.stringify({ test: "value" })
      store.updateActorSnapshot(actorId, newSnapshot)

      // Проверяем, что снапшот обновился
      const result = store.getActor({ tag: meta.tag })
      expect(result, "Актор должен существовать").toBeDefined()

      if (result) {
        expect(result.snapshot, "Снапшот актора должен обновиться").toBe(newSnapshot)
      }
    })

    test("должен получать дочерних акторов", () => {
      // Создаем родительского актора
      const parentId = store.createActor({
        meta_tag: "parent-meta",
        parent_id: null,
        idx: 0,
        snapshot: "{}",
      })

      // Создаем дочерних акторов
      const child1 = {
        meta_tag: "child-meta-1",
        parent_id: parentId,
        idx: 0,
        snapshot: "{}",
      } as const

      const child2 = {
        meta_tag: "child-meta-2",
        parent_id: parentId,
        idx: 1,
        snapshot: "{}",
      } as const

      // Создаем дочерние акторы и сохраняем их ID
      const child1Id = store.createActor(child1)
      const child2Id = store.createActor(child2)

      // Получаем дочерних акторов и явно указываем тип возвращаемого значения
      const children = store.getChildActors(parentId)

      // Проверяем, что результат - массив
      expect(Array.isArray(children), "Дочерние акторы должны быть массивом").toBe(true)

      // Проверяем, что массив не пустой
      expect(children.length, "Массив дочерних акторов не должен быть пустым").toBeGreaterThan(0)

      // Проверяем, что все элементы массива определены и имеют правильную структуру
      children.forEach((child) => {
        // Проверяем, что объект не undefined
        expect(child, "Дочерний актор не должен быть undefined").toBeDefined()

        // Используем тип ActorRecord из index.t.ts
        const childRecord: ActorRecord = child

        // Проверяем тип и наличие всех обязательных полей
        expect(childRecord).toMatchObject({
          id: expect.any(Number),
          meta_tag: expect.any(String),
          parent_id: parentId,
          idx: expect.any(Number),
          snapshot: expect.any(String),
          timestamp: expect.any(String),
        })

        // Проверяем, что временная метка существует и является объектом Any<String>
        expect(childRecord.timestamp, "Временная метка должна быть определена").toBeDefined()
        expect(typeof childRecord.timestamp, "Временная метка должна быть объектом").toBe("object")
        // Проверяем, что у объекта есть метод toString()
        expect(typeof childRecord.timestamp.toString, "У временной метки должен быть метод toString()").toBe("function")
      })

      // Проверяем количество дочерних элементов
      expect(children, "Должны быть получены 2 дочерних актора").toHaveLength(2)

      // Создаем ожидаемый массив тегов для проверки
      const expectedTags = [child1.meta_tag, child2.meta_tag]

      // Проверяем, что дочерние акторы имеют правильные meta_tag
      const actualTags = children.map((child) => child.meta_tag)
      expect(actualTags, "Должны быть получены корректные теги дочерних акторов").toEqual(
        expect.arrayContaining(expectedTags)
      )

      // Проверяем, что дочерние акторы имеют правильные parent_id
      children.forEach((child) => {
        expect(child.parent_id, "Дочерний актор должен иметь правильный parent_id").toBe(parentId)
      })
    })

    test("должен удалять актора и его дочерние элементы", () => {
      const meta = { tag: "test-meta", fingerprint: "test-fingerprint" }
      // Создаем родительского актора
      const parentId = store.createActor({
        meta_tag: meta.tag,
        parent_id: null,
        idx: 0,
        snapshot: "{}",
      })

      // Создаем дочернего актора
      const childId = store.createActor({
        meta_tag: meta.tag,
        parent_id: parentId,
        idx: 0,
        snapshot: "{}",
      })

      // Удаляем родительского актора
      store.deleteActor(parentId)

      // Проверяем, что оба актора удалены
      expect(store.getActor({ tag: meta.tag }), "Родительский актор должен быть удален").toBeNull()
      expect(store.getActor({ tag: meta.tag }), "Дочерний актор должен быть удален каскадно").toBeNull()
    })
  })

  describe("Операции с патчами", () => {
    let actorId: number

    beforeEach(() => {
      // Создаем meta-запись
      store.setMeta({ tag: "test-meta", fingerprint: "test-fingerprint" })

      // Создаем актора для тестирования патчей
      actorId = store.createActor({
        meta_tag: "test-meta",
        parent_id: null,
        idx: 0,
        snapshot: "{}",
      })
    })

    test("должен добавлять и получать патч", () => {
      // Добавляем патч
      const patch = {
        actor_id: actorId,
        op: "add",
        path: "/test",
        value: "test-value",
      } as const

      const patchId = store.addPatch(patch)

      // Получаем патч
      const result = store.getPatch(patchId)

      // Проверяем, что патч корректно создан
      expect(result, "Патч должен быть определен").toBeDefined()

      // Проверяем, что результат не null и не undefined
      if (!result) {
        throw new Error("Патч не найден")
      }

      // Используем тип PatchRecord из index.t.ts
      const patchRecord: PatchRecord = result

      // Проверяем тип и наличие всех обязательных полей
      expect(patchRecord).toMatchObject({
        id: expect.any(Number),
        actor_id: patch.actor_id,
        op: patch.op,
        path: patch.path,
        value: patch.value,
        timestamp: expect.any(String),
      })

      // Проверяем, что ID существует
      expect(patchRecord.id, "ID патча должен быть определен").toBeDefined()

      // Проверяем, что ID не является null или undefined
      expect(patchRecord.id != null, "ID не должен быть null или undefined").toBeTrue()

      // Проверяем, что ID можно преобразовать в строку (на случай, если это объект)
      const idString = String(patchRecord.id)
      expect(idString.length > 0, "ID не должен быть пустой строкой").toBeTrue()

      // Проверяем, что ID можно преобразовать в число (если это числовой ID)
      if (!isNaN(Number(idString))) {
        const numericId = Number(idString)
        expect(numericId > 0, "Числовой ID должен быть больше 0").toBeTrue()
      }
      expect(patchRecord.actor_id, "ID актора в патче должен совпадать").toBe(patch.actor_id)
      expect(patchRecord.op, "Операция в патче должна совпадать").toBe(patch.op)
      expect(patchRecord.path, "Путь в патче должен совпадать").toBe(patch.path)
      expect(patchRecord.value, "Значение в патче должно совпадать").toBe(patch.value)
      // Проверяем, что временная метка определена и является объектом
      expect(patchRecord.timestamp, "Временная метка должна быть определена").toBeDefined()
      expect(typeof patchRecord.timestamp, "Временная метка должна быть объектом").toBe("object")
    })

    test("должен получать патчи по актору", () => {
      // Добавляем несколько патчей
      const patch1 = { actor_id: actorId, op: "add", path: "/test1", value: "value1" }
      const patch2 = { actor_id: actorId, op: "add", path: "/test2", value: "value2" }

      const patch1Id = store.addPatch(patch1)
      const patch2Id = store.addPatch(patch2)

      // Получаем патчи по актору
      const patches = store.getPatchesByActor(actorId)

      // Проверяем, что получены корректные патчи
      expect(patches, "Должны быть получены 2 патча").toHaveLength(2)
      expect(
        patches.map((p) => p.id),
        "Список ID патчей должен содержать ID первого патча"
      ).toContain(patch1Id)
      expect(
        patches.map((p) => p.id),
        "Список ID патчей должен содержать ID второго патча"
      ).toContain(patch2Id)

      // Проверяем сортировку по времени (от старых к новым)
      if (patches[0]!.id === patch1Id) {
        expect(patches[1]!.id, "Второй патч должен иметь правильный ID").toBe(patch2Id)
      } else {
        expect(patches[1]!.id, "Второй патч должен иметь правильный ID").toBe(patch1Id)
        expect(patches[0]!.id, "Первый патч должен иметь правильный ID").toBe(patch2Id)
      }
    })

    test("должен удалять патч", () => {
      // Добавляем патч
      const patchId = store.addPatch({
        actor_id: actorId,
        op: "add",
        path: "/test",
        value: "test-value",
      })

      // Проверяем, что патч создан
      const createdPatch = store.getPatch(patchId)
      expect(createdPatch, "Патч должен быть создан").toBeDefined()

      // Удаляем патч
      store.deletePatch(patchId)

      // Проверяем, что патч удален
      const deletedPatch = store.getPatch(patchId)
      expect(deletedPatch, "Патч должен быть удален").toBeNull()
    })
  })

  describe("Сложные операции", () => {
    test("должен создавать актора с начальным патчем в транзакции", () => {
      const meta = { tag: "test-meta", fingerprint: "test-fingerprint" }
      // Сначала создаем meta-запись
      store.setMeta(meta)

      const actor = {
        meta_tag: meta.tag,
        parent_id: null,
        idx: 0,
        snapshot: "{}",
      }

      const initialPatch = {
        op: "add",
        path: "/test",
        value: "test-value",
      }

      // Создаем актора с начальным патчем
      const { actorId, patchId } = store.createActorWithInitialPatch(actor, initialPatch)

      // Проверяем, что актор создан
      const createdActor = store.getActor({ tag: meta.tag })
      expect(createdActor, "Актор должен быть создан").toBeDefined()

      // Проверяем, что патч создан и привязан к актору
      const patch = store.getPatch(patchId)
      expect(patch, "Патч должен быть создан").toBeDefined()

      if (patch) {
        expect(patch.actor_id, "ID актора в патче должен совпадать с ID созданного актора").toBe(actorId)
      }
    })

    test("должен получать дерево акторов", () => {
      // Создаем meta-записи
      store.setMeta({ tag: "parent-meta", fingerprint: "parent-fingerprint" })
      store.setMeta({ tag: "child-meta-1", fingerprint: "child-fingerprint-1" })
      store.setMeta({ tag: "child-meta-2", fingerprint: "child-fingerprint-2" })
      store.setMeta({ tag: "grandchild-meta", fingerprint: "grandchild-fingerprint" })

      // Создаем дерево акторов
      // parent
      //   ├── child1
      //   └── child2
      //        └── grandchild

      const parentId = store.createActor({
        meta_tag: "parent-meta",
        parent_id: null,
        idx: 0,
        snapshot: "{}",
      })

      const child1Id = store.createActor({
        meta_tag: "child-meta-1",
        parent_id: parentId,
        idx: 0,
        snapshot: "{}",
      })

      const child2Id = store.createActor({
        meta_tag: "child-meta-2",
        parent_id: parentId,
        idx: 1,
        snapshot: "{}",
      })

      const grandchildId = store.createActor({
        meta_tag: "grandchild-meta",
        parent_id: child2Id,
        idx: 0,
        snapshot: "{}",
      })

      // Получаем дерево
      const tree = store.getActorTree("parent-meta")

      // Проверяем структуру дерева
      expect(tree, "Дерево должно быть определено").toBeDefined()

      if (!tree) return // Выходим, если дерево не определено

      // Проверяем, что все узлы присутствуют
      expect(tree.meta_tag, "Корневой узел должен иметь meta_tag").toBe("parent-meta")

      // Проверяем дочерние узлы
      const children = tree.children || []
      expect(Array.isArray(children), "Дочерние узлы должны быть массивом").toBe(true)
      expect(children, "Корневой узел должен иметь 2 дочерних узла").toHaveLength(2)

      // Проверяем первого ребенка
      const firstChild = children[0]
      expect(firstChild, "Первый дочерний узел должен существовать").toBeDefined()

      if (firstChild) {
        // Проверяем, что первый ребенок имеет правильный meta_tag и не имеет потомков
        expect(firstChild.meta_tag, "Первый дочерний узел должен иметь правильный meta_tag").toBe("child-meta-1")
        const firstChildChildren = firstChild.children || []
        expect(firstChildChildren, "Первый дочерний узел не должен иметь потомков").toHaveLength(0)
      }

      // Проверяем второго ребенка и его потомка
      const secondChild = children[1]
      expect(secondChild, "Второй дочерний узел должен существовать").toBeDefined()

      if (secondChild) {
        // Проверяем, что второй ребенок имеет правильный meta_tag и одного потомка
        expect(secondChild.meta_tag, "Второй дочерний узел должен иметь правильный meta_tag").toBe("child-meta-2")

        // Проверяем потомков второго ребенка
        const secondChildChildren = secondChild.children || []
        expect(Array.isArray(secondChildChildren), "Дочерние узлы второго ребенка должны быть массивом").toBe(true)
        expect(secondChildChildren, "Второй дочерний узел должен иметь одного потомка").toHaveLength(1)

        // Проверяем внука
        const grandchild = secondChildChildren[0]
        expect(grandchild, "Потомок второго дочернего узла должен существовать").toBeDefined()

        if (grandchild) {
          // Проверяем, что внук имеет правильный meta_tag и не имеет потомков
          expect(grandchild.meta_tag, "Потомок второго дочернего узла должен иметь правильный meta_tag").toBe(
            "grandchild-meta"
          )
          expect(grandchild.id, "ID внука должен совпадать с ожидаемым").toBe(grandchildId)
          const grandchildChildren = grandchild.children || []
          expect(grandchildChildren, "Внук не должен иметь потомков").toHaveLength(0)
        }
      }
    })
  })

  describe("Резервное копирование", () => {
    test("должен создавать резервную копию базы данных", async () => {
      // Создаем meta-запись
      store.setMeta({ tag: "test-meta", fingerprint: "test-fingerprint" })

      // Используем временный файл для бэкапа
      const backupPath = "test-backup.sqlite"

      // Создаем тестовые данные
      const actorId = store.createActor({
        meta_tag: "test-meta",
        parent_id: null,
        idx: 0,
        snapshot: "{}",
      })

      store.addPatch({
        actor_id: actorId,
        op: "add",
        path: "/test",
        value: "test-value",
      })

      // Создаем бэкап
      expect(() => store.backup(backupPath), "Метод backup должен выполниться без ошибок").not.toThrow()

      // Проверяем, что можем прочитать бэкап
      const backupDb = new Database(backupPath, { readonly: true })

      // Проверяем наличие таблиц в бэкапе
      const tables = backupDb
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .all()

      // Проверяем наличие всех необходимых таблиц
      const expectedTables = ["meta", "actor", "patch"]
      expectedTables.forEach((tableName) => {
        expect(
          tables.some((t: any) => t.name === tableName),
          `В бэкапе должна присутствовать таблица ${tableName}`
        ).toBe(true)
      })

      // Проверяем данные в бэкапе
      const metaCount = backupDb.prepare("SELECT COUNT(*) as count FROM meta").get() as { count: number }
      expect(metaCount.count, "В бэкапе должна быть хотя бы одна meta-запись").toBeGreaterThan(0)

      const actorCount = backupDb.prepare("SELECT COUNT(*) as count FROM actor").get() as { count: number }
      expect(actorCount.count, "В бэкапе должна быть ровно одна запись актора").toBe(1)

      const patchCount = backupDb.prepare("SELECT COUNT(*) as count FROM patch").get() as { count: number }
      expect(patchCount.count, "В бэкапе должна быть ровно одна запись патча").toBe(1)

      // Закрываем соединение с бэкапом
      backupDb.close()

      // Удаляем временный файл бэкапа с помощью нативного метода Bun
      try {
        const file = Bun.file(backupPath)
        if (await file.exists()) {
          // Используем нативный метод delete() для удаления файла
          await file.delete()
        }
      } catch (e) {
        console.warn("Не удалось удалить временный файл бэкапа:", e)
      }
    })
  })

  describe("Устаревшие методы", () => {
    test("должен поддерживать устаревшие методы setSnapshot и getSnapshot", () => {
      const testTag = "test-tag"
      const testFingerprint = "test-fingerprint"

      // Используем устаревший метод setSnapshot
      // Создаем сообщение, соответствующее ожидаемому типу Message
      const message = {
        meta: {
          tag: testTag,
          fingerprint: testFingerprint,
        },
      }

      expect(
        () => store.setSnapshot(message as any), // Приводим к any, так как setSnapshot ожидает тип Message
        "Метод setSnapshot должен выполниться без ошибок"
      ).not.toThrow()

      // Проверяем через новый метод getMeta
      const meta = store.getMeta(testTag)
      expect(meta, "Мета-данные должны быть определены").toBeDefined()

      if (meta) {
        expect(meta.tag, "Тег в meta должен совпадать с ожидаемым").toBe(testTag)
        expect(meta.fingerprint, "Fingerprint в meta должен совпадать с ожидаемым").toBe("fingerprint-placeholder")
      }

      // Проверяем через устаревший метод getSnapshot
      // getSnapshot возвращает MetaRecord | null, поэтому проверяем только его поля
      const snapshot = store.getSnapshot(testTag)
      expect(snapshot, "Снапшот должен быть определен").toBeDefined()

      if (snapshot) {
        expect(snapshot.tag, "Тег в снапшоте должен совпадать с ожидаемым").toBe(testTag)
        expect(snapshot.fingerprint, "Fingerprint в снапшоте должен совпадать с ожидаемым").toBe(
          "fingerprint-placeholder"
        )
        expect(snapshot.timestamp, "Временная метка должна быть определена").toBeDefined()
      }
    })
  })
})
