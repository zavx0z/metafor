# MetaFor Plan

Рабочий план для текущей разработки. HUD Plan читает этот файл и показывает
только ближайшие незакрытые задачи.

## 1. Dark / Bulk Browser Shell

- [.50] Связать Matrix photons и Bulk visual update в основном browser shell без чтения Boundary из Matrix/Bulk.

## 2. Topology Runtime

- [ ] Спроектировать миграцию `enum -> Fuzzy`.
- [ ] Спроектировать миграцию `array -> MACHO`.
- [ ] Убрать переходную трактовку `enum`/`array` как ordinary field types в runtime topology.

## 3. Source / Entanglement

- [ ] Решить, хватает ли общего `actor_value.value` для source/entanglement.
- [ ] Если нет, добавить `actor_value_source` или equivalent runtime source projection.

## 4. Документация DSL

- [ ] Привести раздел `Reactions` к реальному API.
- [ ] Уточнить структуру process action.

## 5. Interpreter / HUD / Space

- [100] Починить удаление целой строки в source editor через Command+Delete на macOS.
- [100] Починить сохранение пользовательской раскладки display: после reload surfaces не должны выстраиваться в одну линию.
- [100] Научить Plan создавать пункты в профильных секциях, а не складывать все задачи в конец файла.
- [100] Перенести видимость Plan updates в todo.* tools: mutating commands должны сами показывать/подсвечивать измененный пункт.
- [100] Сделать так, чтобы Plan HUD прокручивал подсвеченный todo item в видимую область.
- [100] Сделать breakpoint tools agent-friendly: не принимать неисполняемые строки молча и показывать фактическую runtime-точку.
- [100] Починить agent-facing debug context: после step context.get не должен отдавать stale UI currentFrame вместо свежего runtime snapshot.
- [100] Добавить source locator pipeline для агентов: найти строку/контекст без ручного подсчёта и ставить breakpoint по locator.
