# Правила Пакета @metafor/types

`@metafor/types` - единый источник контрактов корня MetaFor и основных доменов.
Типы здесь определяются не по удобству импорта, а по dependency layer: нижний
слой не должен видеть верхний слой даже через `import type`.

Причина: TypeScript-only imports всё равно попадают в source/import graph
интерпретатора и tooling. Если persistence/runtime contract импортирует
browser, UI или engine contract, то server-side display начинает видеть лишние
пакеты, хотя runtime-код их не исполняет.

## Правило Слоя

Каждый файл типов должен принадлежать одному слою:

1. persistence/API/runtime snapshot;
2. protocol/client message;
3. pure layout/settings/data transform;
4. engine viewport/render;
5. UI/HUD surface.

Файл нижнего слоя может импортировать только типы своего слоя или более низких
слоёв. Обратный импорт запрещён.

## Правило Импорта

- Импортируй конкретный subpath: `@metafor/types/bulk/runtime`, а не barrel.
- Не создавай alias type ради совместимости.
- Не реэкспортируй типы из `index.ts` и runtime-пакетов.
- Не смешивай в одном файле persistence/runtime contract с browser/UI/engine
  contract.
- `import type` из `@ui/*`, `@metafor/engine`, DOM-heavy browser APIs разрешён
  только в файлах, которые явно являются viewport/HUD/browser-слоем.

## Правило Дедупликации

Один смысловой контракт имеет одно каноническое имя. Если два типа отличаются
только доменным префиксом или местом использования, выбери один тип и обнови
импорты. Раздельные имена допустимы только для разных стадий одного процесса:
input, persistence row, runtime snapshot, protocol message, render record.

## Bulk Layers

- `bulk/runtime` - Boundary -> Bulk runtime snapshot. Без layout, settings,
  protocol, engine и UI.
- `bulk/settings` - сериализуемые настройки и их ключи. Без viewport/HUD.
- `bulk/protocol` - client/server сообщения Bulk.
- `bulk/layout` - чистый layout/data contract без engine/UI.
- `bulk/text` - text/geometry contracts; может импортировать engine text/geometry.
- `bulk/viewport` - browser/engine viewport/render contracts.
- `bulk/hud` - UI/HUD surface contracts; только здесь допустимы `@ui/*` types.

## Проверка

После изменения типов проверяй:

```sh
bun run tsc --noEmit
bun test
```

И отдельно проверяй неожиданные зависимости:

```sh
rg -n "@ui/|@metafor/engine" types
```
