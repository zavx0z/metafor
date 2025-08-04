import { Database } from 'bun:sqlite';
import type { MetaRecord, ActorRecord, PatchRecord, TransactionCallback, ActorTreeNode } from "./index.t"
import type { Message } from "../../core/message"

// Импортируем SQL-запросы
import createTablesQuery from "./queries/create.sql" with { type: "text" }

// Импортируем SQL-запросы для работы с meta
import setMetaQuery from "./queries/meta/setMeta.sql" with { type: "text" }
import getMetaQuery from "./queries/meta/getMeta.sql" with { type: "text" }
import deleteMetaQuery from "./queries/meta/deleteMeta.sql" with { type: "text" }

// Импортируем SQL-запросы для работы с акторами
import createActorQuery from "./queries/actor/createActor.sql" with { type: "text" }
import getActorQuery from "./queries/actor/getActor.sql" with { type: "text" }
import updateActorSnapshotQuery from "./queries/actor/updateActorSnapshot.sql" with { type: "text" }
import getChildActorsQuery from "./queries/actor/getChildActors.sql" with { type: "text" }
import deleteActorQuery from "./queries/actor/deleteActor.sql" with { type: "text" }

// Импортируем SQL-запросы для работы с патчами
import addPatchQuery from "./queries/patch/addPatch.sql" with { type: "text" }
import getPatchesByActorQuery from "./queries/patch/getPatchesByActor.sql" with { type: "text" }
import getPatchQuery from "./queries/patch/getPatch.sql" with { type: "text" }
import deletePatchQuery from "./queries/patch/deletePatch.sql" with { type: "text" }

// Импортируем SQL-запросы для бэкапа
import getTablesQuery from "./queries/backup/getTables.sql" with { type: "text" }
import getOtherObjectsQuery from "./queries/backup/getOtherObjects.sql" with { type: "text" }

export class Store {
  #db: Database

  constructor(path: string = "store.sqlite") {
    this.#db = new Database(path, { create: true });
    
    // Включаем проверку внешних ключей
    this.#db.run("PRAGMA foreign_keys = ON;");
    
    // Включаем WAL режим для лучшей производительности
    this.#db.run("PRAGMA journal_mode = WAL;");
    
    // Создаем таблицы
    const statements = createTablesQuery
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    // Выполняем каждый SQL-запрос отдельно
    for (const statement of statements) {
      try {
        this.#db.run(statement);
      } catch (error) {
        console.error('Error executing SQL statement:', statement);
        console.error(error);
        throw error;
      }
    }
  }

  /**
   * Выполняет операции в транзакции
   */
  #transaction(callback: TransactionCallback) {
    const commit = this.#db.transaction(() => {
      callback(this.#db)
    })
    
    try {
      commit()
    } catch (error) {
      console.error("Transaction failed:", error)
      throw error
    }
  }

  // ===== Методы для работы с Meta =====

  /**
   * Создает или обновляет запись в таблице meta
   */
  setMeta(meta: Omit<MetaRecord, 'timestamp'>): void {
    // Используем явную транзакцию для гарантии фиксации
    const stmt = this.#db.prepare(setMetaQuery);
    try {
      this.#db.transaction(() => {
        stmt.run(meta.tag, meta.fingerprint);
      })();
    } catch (error) {
      console.error('Error in setMeta transaction:', error);
      throw error;
    }
  }

  /**
   * Получает запись из таблицы meta по тегу
   */
  getMeta(tag: string): MetaRecord | null {
    return this.#db.prepare(getMetaQuery).get(tag) as MetaRecord | null
  }

  /**
   * Удаляет запись из таблицы meta по тегу
   * (каскадно удалит связанные записи из actor и patch)
   */
  deleteMeta(tag: string): void {
    this.#db.prepare(deleteMetaQuery).run(tag)
  }

  // ===== Методы для работы с Actor =====

  /**
   * Создает нового актора
   */
  createActor(actor: Omit<ActorRecord, 'id' | 'timestamp'>): number {
    try {
      // Проверяем, что meta_tag существует
      const metaExists = this.#db
        .prepare('SELECT 1 FROM meta WHERE tag = ?')
        .get(actor.meta_tag);
      
      if (!metaExists) {
        throw new Error(`Meta with tag '${actor.meta_tag}' does not exist`);
      }
      
      // Если указан parent_id, проверяем, что родитель существует
      if (actor.parent_id !== null && actor.parent_id !== undefined) {
        const parentExists = this.#db
          .prepare('SELECT 1 FROM actor WHERE id = ?')
          .get(actor.parent_id);
        
        if (!parentExists) {
          throw new Error(`Parent actor with id ${actor.parent_id} does not exist`);
        }
      }
      
      // Создаем актора в транзакции
      return this.#db.transaction(() => {
        const result = this.#db
          .prepare(createActorQuery)
          .run(actor.meta_tag, actor.parent_id, actor.idx, actor.snapshot);
        return Number(result.lastInsertRowid);
      })();
    } catch (error) {
      console.error('Error in createActor:', error);
      throw error;
    }
  }

  /**
   * Получает актора по ID
   */
  getActor(id: number): ActorRecord | null {
    return this.#db.prepare(getActorQuery).get(id) as ActorRecord | null
  }

  /**
   * Обновляет снапшот актора
   */
  updateActorSnapshot(id: number, snapshot: string): void {
    this.#db.prepare(updateActorSnapshotQuery).run(snapshot, id)
  }

  /**
   * Получает всех дочерних акторов для указанного родителя
   */
  getChildActors(parentId: number): ActorRecord[] {
    return this.#db.prepare(getChildActorsQuery).all(parentId) as ActorRecord[]
  }

  /**
   * Удаляет актора и всех его потомков (каскадно)
   */
  deleteActor(id: number): void {
    this.#db.prepare(deleteActorQuery).run(id)
    // Каскадное удаление сработает автоматически благодаря ON DELETE CASCADE
  }

  // ===== Методы для работы с Patch =====

  /**
   * Добавляет новый патч
   */
  addPatch(patch: Omit<PatchRecord, 'id' | 'timestamp'>): number {
    const result = this.#db
      .prepare(addPatchQuery)
      .run(patch.actor_id, patch.op, patch.path, patch.value)
    
    return Number(result.lastInsertRowid)
  }

  /**
   * Получает все патчи для указанного актора
   */
  getPatchesByActor(actorId: number): PatchRecord[] {
    return this.#db.prepare(getPatchesByActorQuery).all(actorId) as PatchRecord[]
  }

  /**
   * Получает патч по ID
   */
  getPatch(id: number): PatchRecord | null {
    return this.#db.prepare(getPatchQuery).get(id) as PatchRecord | null
  }

  /**
   * Удаляет патч по ID
   */
  deletePatch(id: number): void {
    this.#db.prepare(deletePatchQuery).run(id)
  }

  // ===== Комплексные операции =====

  /**
   * Создает актора и его корневой патч в одной транзакции
   */
  createActorWithInitialPatch(actor: Omit<ActorRecord, 'id' | 'timestamp'>, initialPatch: Omit<PatchRecord, 'id' | 'actor_id' | 'timestamp'>): { actorId: number, patchId: number } {
    let actorId: number
    let patchId: number

    this.#transaction((db) => {
      // Создаем актора
      const actorResult = db.prepare(createActorQuery).run(
        actor.meta_tag, 
        actor.parent_id, 
        actor.idx, 
        actor.snapshot
      )
      
      actorId = Number(actorResult.lastInsertRowid)
      
      // Создаем начальный патч
      const patchResult = db.prepare(addPatchQuery).run(
        actorId, 
        initialPatch.op, 
        initialPatch.path, 
        initialPatch.value
      )
      
      patchId = Number(patchResult.lastInsertRowid)
    })

    return { actorId: actorId!, patchId: patchId! }
  }

  /**
   * Получает полное дерево акторов, начиная с корневого
   */
  getActorTree(rootId: number): ActorTreeNode | null {
    const actor = this.getActor(rootId)
    if (!actor) return null

    const children = this.getChildActors(rootId)
      .map(child => this.getActorTree(child.id))
      .filter((child): child is ActorTreeNode => child !== null);
    
    // Создаем объект, исключая parent_id и idx, так как они не нужны в дереве
    const { parent_id, idx, ...actorWithoutParentInfo } = actor;
    
    return {
      ...actorWithoutParentInfo,
      children
    };
  }

  // ===== Устаревшие методы =====

  /**
   * @deprecated Используйте setMeta
   */
  setSnapshot(message: Message) {
    this.setMeta({
      tag: message.meta.tag,
      fingerprint: 'fingerprint-placeholder'
    })
  }

  /**
   * @deprecated Используйте getMeta
   */
  getSnapshot(tag: string) {
    return this.getMeta(tag)
  }

  // ===== Управление соединением =====

  /**
   * Закрывает соединение с базой данных
   */
  close(): void {
    this.#db.close()
  }

  /**
   * Выполняет резервное копирование базы данных в указанный файл
   */
  backup(destinationPath: string): void {
    // Создаем новую базу данных для бэкапа
    const backupDb = new Database(destinationPath)
    
    try {
      // Копируем схему и данные с помощью SQL-запросов
      // 1. Копируем схему
      const tables = this.#db.query(getTablesQuery)
        .all() as Array<{name: string, sql: string}>
      
      for (const {name, sql} of tables) {
        if (sql) {
          backupDb.exec(sql)
          
          // Копируем данные
          const data = this.#db.query(`SELECT * FROM ${name}`).all()
          if (data.length > 0) {
            const columns = Object.keys(data[0] as object)
            const placeholders = columns.map(() => '?').join(', ')
            const insert = backupDb.prepare(`INSERT INTO ${name} (${columns.join(', ')}) VALUES (${placeholders})`)
            
            for (const row of data) {
              // Преобразуем значения строки в массив и передаем его с помощью spread оператора
              const values = columns.map(col => (row as any)[col])
              // @ts-ignore - игнорируем ошибку типизации, так как мы уверены в структуре данных
              insert.run(...values)
            }
          }
        }
      }
      
      // 2. Копируем индексы, представления и триггеры
      const otherObjects = this.#db.query(getOtherObjectsQuery)
        .all() as Array<{sql: string}>
      
      for (const {sql} of otherObjects) {
        if (sql) {
          backupDb.exec(sql)
        }
      }
      
      // 3. Применяем PRAGMA настройки
      const pragmas = [
        "PRAGMA journal_mode",
        "PRAGMA synchronous",
        "PRAGMA cache_size",
        "PRAGMA foreign_keys"
      ]
      
      for (const pragma of pragmas) {
        const value = this.#db.query(`${pragma}`).get() as Record<string, any>
        if (value) {
          const setting = Object.values(value)[0]
          backupDb.exec(`${pragma} = ${setting}`)
        }
      }
    } finally {
      // Всегда закрываем соединение с бэкапной БД
      backupDb.close()
    }
  }
}
