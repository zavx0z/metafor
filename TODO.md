# MetaFor Plan

Рабочий план для текущей разработки. HUD Plan читает этот файл и показывает
только ближайшие незакрытые задачи.

## 1. Dark / Bulk Browser Shell

- [.50] Связать Matrix photons и Bulk visual update в основном browser shell без чтения Boundary из Matrix/Bulk.

## 2. Topology Runtime

- [ ] Спроектировать миграцию `enum -> Fuzzy`.
- [ ] Спроектировать миграцию `array -> MACHO`.

## 3. Source / Entanglement

- [ ] Решить, хватает ли общего `actor_value.value` для source/entanglement.

## 4. Документация DSL

- [ ] Привести раздел `Reactions` к реальному API.
- [ ] Уточнить структуру process action.

## 5. Interpreter / HUD / Space
- [100] Сделать MVP Browser Agent Chat для Qwen в interpreter HUD.
- [ ] Доработать быстрые Space display tools: авто-сетка по количеству display, максимально плотный fit/приближение камеры и удобные пресеты раскладки.
- [100] Показывать в Browser Agent Chat отдельный blocked status, когда remote chat упёрся в дневной лимит/usage quota.

## 6. Browser Agent Chat: изображения

- [100] MVP передаёт изображения в Qwen как текстовые пути через composer message.
- [ ] Выбрать следующий transport для настоящего vision-ввода: Qwen API или headed browser upload.
