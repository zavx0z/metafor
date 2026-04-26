import type { Database } from "bun:sqlite"
import { actorRequiredBackendIndexes } from "../backend.t.ts"

/**
 * DDL инстансного слоя. Применяется на той же `Database`, что и meta-DDL и любые другие схемы;
 * префикс `actor_` обеспечивает изоляцию пространства имён.
 *
 * FK на `meta(src)` (через `meta_src`, `world`) намеренно НЕ создаются: actor может ссылаться на
 * мету, лежащую в другой БД, либо ещё не загруженную. Целостность ref проверяется на стороне
 * рантайма перед записью.
 */
const actorSchemaSql = `
CREATE TABLE IF NOT EXISTS actor
(
    uuid     TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    world    TEXT    NOT NULL CHECK (length(trim(world)) > 0),
    metaSrc  TEXT    NOT NULL CHECK (length(trim(metaSrc)) > 0),
    position INTEGER NOT NULL CHECK (position >= 0)
);

CREATE TABLE IF NOT EXISTS actor_edge
(
    child    TEXT PRIMARY KEY CHECK (length(trim(child)) > 0),
    parent   TEXT,
    position INTEGER NOT NULL CHECK (position >= 0),
    FOREIGN KEY (child) REFERENCES actor (uuid) ON DELETE CASCADE,
    FOREIGN KEY (parent) REFERENCES actor (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS actor_field
(
    uuid      TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    actor     TEXT    NOT NULL CHECK (length(trim(actor)) > 0),
    metaField TEXT    NOT NULL CHECK (length(trim(metaField)) > 0),
    position  INTEGER NOT NULL CHECK (position >= 0),
    UNIQUE (actor, metaField),
    UNIQUE (actor, position),
    FOREIGN KEY (actor) REFERENCES actor (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS actor_value
(
    field   TEXT PRIMARY KEY CHECK (length(trim(field)) > 0),
    kind    TEXT    NOT NULL CHECK (kind IN ('null', 'boolean', 'number', 'string', 'enum', 'list')),
    boolean INTEGER CHECK (boolean IS NULL OR boolean IN (0, 1)),
    number  REAL,
    text    TEXT,
    variant TEXT,
    FOREIGN KEY (field) REFERENCES actor_field (uuid) ON DELETE CASCADE,
    CHECK (
        (kind = 'null' AND boolean IS NULL AND number IS NULL AND text IS NULL AND variant IS NULL) OR
        (kind = 'boolean' AND boolean IS NOT NULL AND number IS NULL AND text IS NULL AND variant IS NULL) OR
        (kind = 'number' AND number IS NOT NULL AND boolean IS NULL AND text IS NULL AND variant IS NULL) OR
        (kind = 'string' AND text IS NOT NULL AND boolean IS NULL AND number IS NULL AND variant IS NULL) OR
        (kind = 'enum' AND variant IS NOT NULL AND boolean IS NULL AND number IS NULL AND text IS NULL) OR
        (kind = 'list' AND boolean IS NULL AND number IS NULL AND text IS NULL AND variant IS NULL)
        )
);

CREATE TABLE IF NOT EXISTS actor_value_item
(
    field    TEXT NOT NULL CHECK (length(trim(field)) > 0),
    position INTEGER NOT NULL CHECK (position >= 0),
    kind     TEXT NOT NULL CHECK (kind IN ('null', 'boolean', 'number', 'string', 'enum')),
    boolean  INTEGER CHECK (boolean IS NULL OR boolean IN (0, 1)),
    number   REAL,
    text     TEXT,
    variant  TEXT,
    PRIMARY KEY (field, position),
    FOREIGN KEY (field) REFERENCES actor_value (field) ON DELETE CASCADE,
    CHECK (
        (kind = 'null' AND boolean IS NULL AND number IS NULL AND text IS NULL AND variant IS NULL) OR
        (kind = 'boolean' AND boolean IS NOT NULL AND number IS NULL AND text IS NULL AND variant IS NULL) OR
        (kind = 'number' AND number IS NOT NULL AND boolean IS NULL AND text IS NULL AND variant IS NULL) OR
        (kind = 'string' AND text IS NOT NULL AND boolean IS NULL AND number IS NULL AND variant IS NULL) OR
        (kind = 'enum' AND variant IS NOT NULL AND boolean IS NULL AND number IS NULL AND text IS NULL)
        )
);

CREATE TABLE IF NOT EXISTS actor_source
(
    childField  TEXT PRIMARY KEY CHECK (length(trim(childField)) > 0),
    parentField TEXT NOT NULL CHECK (length(trim(parentField)) > 0),
    FOREIGN KEY (childField) REFERENCES actor_field (uuid) ON DELETE CASCADE,
    FOREIGN KEY (parentField) REFERENCES actor_field (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS actor_state
(
    actor     TEXT PRIMARY KEY CHECK (length(trim(actor)) > 0),
    metaState TEXT NOT NULL CHECK (length(trim(metaState)) > 0),
    FOREIGN KEY (actor) REFERENCES actor (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS actor_entanglement
(
    uuid      TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    world     TEXT NOT NULL CHECK (length(trim(world)) > 0),
    rootField TEXT NOT NULL CHECK (length(trim(rootField)) > 0),
    UNIQUE (rootField),
    FOREIGN KEY (rootField) REFERENCES actor_field (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS actor_entanglement_member
(
    entanglement TEXT NOT NULL CHECK (length(trim(entanglement)) > 0),
    actor        TEXT NOT NULL CHECK (length(trim(actor)) > 0),
    position     INTEGER NOT NULL CHECK (position >= 0),
    PRIMARY KEY (entanglement, actor),
    FOREIGN KEY (entanglement) REFERENCES actor_entanglement (uuid) ON DELETE CASCADE,
    FOREIGN KEY (actor) REFERENCES actor (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS actor_entanglement_field
(
    uuid         TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    entanglement TEXT NOT NULL CHECK (length(trim(entanglement)) > 0),
    metaField    TEXT NOT NULL CHECK (length(trim(metaField)) > 0),
    position     INTEGER NOT NULL CHECK (position >= 0),
    UNIQUE (entanglement, position),
    FOREIGN KEY (entanglement) REFERENCES actor_entanglement (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS actor_entanglement_field_member
(
    entanglementField TEXT NOT NULL CHECK (length(trim(entanglementField)) > 0),
    actorField        TEXT NOT NULL CHECK (length(trim(actorField)) > 0),
    position          INTEGER NOT NULL CHECK (position >= 0),
    PRIMARY KEY (entanglementField, actorField),
    UNIQUE (actorField),
    FOREIGN KEY (entanglementField) REFERENCES actor_entanglement_field (uuid) ON DELETE CASCADE,
    FOREIGN KEY (actorField) REFERENCES actor_field (uuid) ON DELETE CASCADE
);
`

/**
 * Применяет actor DDL (11 таблиц) к уже открытому Database. Идемпотентно — все CREATE с IF NOT EXISTS.
 * PRAGMA не трогает (ответственность владельца Database).
 */
export const initializeActorSqliteSchema = (db: Database): void => {
  db.exec(actorSchemaSql)
  for (const index of actorRequiredBackendIndexes) {
    const unique = index.unique ? "UNIQUE " : ""
    db.exec(`CREATE ${unique}INDEX IF NOT EXISTS ${index.name} ON ${index.table}(${index.columns.join(", ")})`)
  }
}

/**
 * Очищает все actor-таблицы для всех миров. Используется в тестах и на полный сброс state-а.
 * Каскад FK снимает зависимые строки автоматически — достаточно DELETE из корневой `actor`.
 */
export const resetActorSqliteSchema = (db: Database): void => {
  db.transaction(() => {
    db.exec("DELETE FROM actor_entanglement_field_member")
    db.exec("DELETE FROM actor_entanglement_field")
    db.exec("DELETE FROM actor_entanglement_member")
    db.exec("DELETE FROM actor_entanglement")
    db.exec("DELETE FROM actor_state")
    db.exec("DELETE FROM actor_source")
    db.exec("DELETE FROM actor_value_item")
    db.exec("DELETE FROM actor_value")
    db.exec("DELETE FROM actor_field")
    db.exec("DELETE FROM actor_edge")
    db.exec("DELETE FROM actor")
  })()
}
