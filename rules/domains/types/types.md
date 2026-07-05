# Типы в MetaFor

Все типы корня и основных доменов живут в одном пакете `@metafor/types`.

Основные разделы:

- `@metafor/types/metafor/*`
- `@metafor/types/force/*`
- `@metafor/types/boundary/*`
- `@metafor/types/matrix/*`
- `@metafor/types/bulk/*`
- `@metafor/types/energy/*`
- `@metafor/types/template/*`

## Правила

- В корне проекта и в `dark/**`, `boundary/**`, `matrix/**`, `bulk/**`, `energy/**` не объявляются `type` и `interface`.
- Тип импортируется из конкретного subpath, например `@metafor/types/matrix/runtime`, а не через barrel.
- Один смысловой контракт имеет одно каноническое имя. Дубли с другим доменным префиксом не создаются.
- Похожие типы оставляются раздельно только когда описывают разные стадии: input, persistence row, runtime snapshot, GPU/backend dump.
- `index.ts` пакетов не расширяется ради типов. Импортируй тип напрямую из `@metafor/types/...`.

## Проверка

Перед коммитом запускай:

```bash
bun run tsc --noEmit
bun test
```

Дополнительно проверь, что в корне и основных доменах не осталось локальных объявлений типов.
