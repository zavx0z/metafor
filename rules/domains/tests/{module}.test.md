# Тесты модуля

Этот шаблон разбит на отдельные правила по темам:

- [expect-message.md](./expect-message.md) — у каждого `expect` есть второй аргумент с описанием проверки
- [let-before-test.md](./let-before-test.md) — `let` только по месту первого присваивания и только для реально shared state
- [one-step-per-test.md](./one-step-per-test.md) — один сценарный шаг и один уровень generator на тест
- [current-ref-only.md](./current-ref-only.md) — тесты только по текущему `ref`
