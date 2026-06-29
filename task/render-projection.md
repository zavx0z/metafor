# Рендер-Проекция

Дата актуализации: 2026-06-14.

Рендер-проекция принадлежит рантайму `Bulk`.
Она не является частью персистентного `Boundary` и не должна импортироваться из
`boundary.actor`.

## Инварианты

- `Dark` материализует структуру в `Boundary`.
- `Boundary` фиксирует персистентные `wimp`/`actor`/`topology`.
- `Energy` получает рантайм-данные и ведёт переход состояния.
- `Bulk` получает события проекции/рантайма и проявляет сцену.
- `Bulk` не читает `Boundary`/SQLite как скрытый загрузчик.
- `AppWeb` получает готовые события рендера / manifest items и остаётся вьюпорт-клиентом.
- Torus/Sphere are geometry names, not ontology names.
- Row is not part of Bulk vocabulary because Bulk manifest is not persistence.

## Контракт Проекции

Проекция должна быть отдельным Bulk-контрактом:

- Dark particles: WIMP/Fuzzy/MACHO/Axion manifested as torus geometry;
- Field particles: String/Number/Boolean manifested as sphere geometry;
- parent/depth/topology relation;
- layout coordinates в Z-up/mm;
- colors/labels/visibility;
- инкрементальные события upsert/remove.

Эти данные могут кешироваться внутри рантайма `Bulk` или серверной проекции,
но не становятся персистентной истиной.

## Следующий шаг

Собрать минимальный модуль рендер-проекции `Bulk` и перевести `bulk/web`,
`bulk/gravity/layout` и `app/web` на него без чтения БД `Boundary` и без
браузерного IDB-зеркала.
