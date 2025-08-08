# Персистентность MetaFor

Документ описывает модель персистентности акторов MetaFor, схему данных, API стора и сценарии ре-гидратации. Серверная реализация — SQLite, клиентская (план) — IndexedDB.

## 1. Идентичность

- **meta**: хеш fingerprint конфигурации актора (имя, context snapshot, states, processes, reactions, view snapshot)
- Один и тот же код → один и тот же `meta`

## 2. Что сохраняем

- `meta(meta, fingerprint, persist, timestamp)` — справочник конфигураций
- `actor(id, meta, parent_id, idx, key, snapshot, timestamp)` — дерево акторов и их текущее состояние
- `snapshot` — сериализованный `element.snapshot`: `{ state, context(values), states, processes, reactions, view, description?, persist }`
- `path` не хранится, вычисляется из DOM: `meta:idx/meta:idx/...`
- `persist` — определяет, восстанавливать ли состояние при создании актора и сохранять ли обновления snapshot

## 3. Когда сохраняем

- При монтировании (connectedCallback): `saveActorIsNotExist(meta,parent_id,idx)`
- После `update()`, смены состояния и завершения процесса: `updateActorSnapshot(id,snapshot)`

## 4. Восстановление (rehydration)

- Перед первым render: если `persist: true` и найден `snapshot`, применяем `state` и значения `context` напрямую (без событий)
- При `persist: false` восстановление состояния не выполняется, актор инициализируется с дефолтными значениями
- Затем выполняется обычный `render()` и переходы

## 5. SQLiteStore (server)

Файл: `server/store/index.ts`

### Схема

```sql
CREATE TABLE IF NOT EXISTS meta (
  meta TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  persist BOOLEAN NOT NULL DEFAULT 1,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS actor (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meta TEXT NOT NULL,
  parent_id INTEGER,
  idx INTEGER NOT NULL,
  snapshot TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES actor (id) ON DELETE CASCADE,
  FOREIGN KEY (meta) REFERENCES meta (meta) ON DELETE CASCADE,
  UNIQUE (meta, parent_id, idx)
);

CREATE INDEX IF NOT EXISTS idx_actor_meta ON actor (meta);
CREATE INDEX IF NOT EXISTS idx_actor_parent ON actor (parent_id);
```

### API

- `saveMetaIsNotExists(fingerprint): string` → `meta`
- `getMeta(meta): MetaRecord | null`
- `saveActorIsNotExist({ meta, parent_id, idx, snapshot }): ActorStore` — upsert по `(meta,parent_id,idx)`, без перезаписи snapshot при повторном монтировании
- `getActorByMeta(meta): ActorStore | null` — последний по id
- `getActorByComposite(meta, parent_id, idx): ActorStore | null` — точечный поиск по составному ключу
- `updateActorSnapshot(id, snapshot): void`

### Поведение

- Повторный монт: запись по `(meta,parent_id,idx)` возвращается как есть (snapshot не перетирается)
- Индексация `idx` — по DOM среди одноимённых meta-тегов на уровне
- `parent_id` вычисляется по сегментам пути родителя через последовательные `getActorByComposite(meta,parent_id,idx)`

## 6. IndexedDBStore (browser, план)

- Object stores: `meta(keyPath: meta)`, `actor(keyPath: id, indexes: meta, parent_id, composite(meta,parent_id,idx)`)
- Поведение API аналогично SQLiteStore (уникальность `(meta,parent_id,idx)`, запрет перезаписи snapshot при повторном монтировании)

## 7. Тесты

- Персистентность/rehydration: `core/store/test/persist.rehydrate.spec.ts`
- Parent/child, idx: `core/store/test/children.persist.spec.ts`
- Пути и иерархии + repeat: `core/store/test/path.repeat.*.spec.ts`

## 8. Рекомендации

- Для стабильного DOM-диффа используйте `repeat(items, keyFn, template)` с уникальными ключами
- В `context` храните только примитивы, сложное — в `core`
- Для тестов включайте `dev: true` у акторов (открытый Shadow DOM)
