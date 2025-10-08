import { contextFromSchema } from "@zavx0z/context"
import { Actor } from "./core"
import { processesFromSchema } from "./core/processes"
import { reactionsFromSchema } from "./core/reactions"
import type { ContextSchema } from "./core/store.t"
import type { MetaSchema } from "./schema"
import type { ActorFabricParam } from "./fabric.t"

export async function actorFabric({ store, src, env, renderer }: ActorFabricParam) {
  async function createActor(src: string, params?: { name: string; id: string | number }) {
    if (!src) {
      console.warn(`src: ${src} is not defined`)
      return
    }
    // ========================================
    // 1. ИМПОРТ МОДУЛЯ И ПОЛУЧЕНИЕ СХЕМЫ
    // ========================================
    let meta: MetaSchema
    try {
      // Загружаем модуль с политикой network-first (сначала сеть, потом кеш)
      meta = (await store.meta.import("/" + src + ".js", "network-first")) as MetaSchema
      if (!meta) {
        console.error(`Module: ${src} is not defined`)
        return
      }
    } catch (error) {
      console.error(`Error importing module ${src}:`, error)
      return
    }
    const context = contextFromSchema(meta.context)
    // ========================================
    // 2. СОЗДАНИЕ ТАБЛИЦЫ ДЛЯ АКТОРА ЕСЛИ ЕЕ НЕТ
    // ========================================
    try {
      // Создаем таблицу на основе схемы контекста из модуля
      // Если таблица уже существует, операция игнорируется
      await store.actor.createTableIfNotExist(meta.name, meta.context as ContextSchema)
    } catch (error) {
      console.error(`Error creating table for ${meta.name}:`, error)
      return
    }

    // ========================================
    // 3. ПРОВЕРКА СУЩЕСТВУЮЩИХ ДАННЫХ
    // ========================================
    let actorSchemas
    try {
      // Получаем все записи для данного актора
      // Если передан params.name, ищем по имени, иначе по meta.name
      actorSchemas = await store.actor.getAll(params ? params.name : meta.name)
    } catch (error) {
      console.error(`Error getting actor schemas for ${meta.name}:`, error)
      return
    }

    // ========================================
    // 4. ИНИЦИАЛИЗАЦИЯ ДАННЫХ ПО УМОЛЧАНИЮ
    // ========================================
    if (!actorSchemas.length) {
      // Если данных нет, создаем запись с значениями по умолчанию
      let value: Record<string, any> = {}

      // Собираем значения по умолчанию из схемы
      for (const [key, fieldSchema] of Object.entries(meta.context)) {
        if (fieldSchema.default !== undefined) {
          // Если есть значение по умолчанию, используем его
          value[key] = fieldSchema.default
        } else if (!fieldSchema.required) {
          // Если поле не обязательное и нет значения по умолчанию, ставим null
          value[key] = null
        }
      }

      console.log("Creating initial actor data:", meta.context, value)

      try {
        // Вставляем начальные данные в таблицу
        await store.actor.insert(meta.name, value)
      } catch (error) {
        console.error(`Error inserting initial actor data for ${meta.name}:`, error)
        return
      }
    } else {
      context.update(actorSchemas[0])
    }

    // ========================================
    // 5. СОЗДАНИЕ ЭКЗЕМПЛЯРА АКТОРА
    // ========================================
    new Actor(
      meta.name,
      meta.description,
      context,
      env,
      store,
      { state: Object.keys(meta.states)[0] as string, states: meta.states },
      processesFromSchema(meta.processes ?? {}),
      reactionsFromSchema(meta.reactions ?? { reactions: {}, states: {} }),
      meta.render ?? [],
      renderer
    )
  }

  createActor(src)
}
