/**
 * `@boundary` — публичный API Boundary.
 *
 * @packageDocumentation
 *
 * ## Архитектура
 *
 * Домен `Boundary` — граница фиксации, уплощения, каноникализации и вычислимой формы.
 *
 * `Boundary` не владеет source graph loading и primary addressing:
 * эти обязанности закреплены за `@metafor/dark`.
 *
 * Домен изолирован. Прямые импорты из `@boundary` в production-коде запрещены.
 * Тесты используют `@github/zavx0z/git` для интеграционной проверки.
 *
 * @see {@link https://github.com/zavx0z/metafor/blob/main/docs/ONTOLOGY.md | ONTOLOGY.md} — онтология доменов
 * @see {@link https://github.com/zavx0z/metafor/blob/main/docs/ARCHITECTURE.md | ARCHITECTURE.md} — архитектурная проекция
 * @see {@link https://github.com/zavx0z/metafor/blob/main/docs/DEVELOPMENT.md | DEVELOPMENT.md} — режим разработки
 */
