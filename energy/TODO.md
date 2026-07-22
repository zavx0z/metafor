# Energy TODO

## Filesystem Mass

- Заменить default in-memory `EnergyMassStore` на filesystem-backed store.
- Сначала определить устойчивую Mass identity: прямой ключ Atom ID неверен для
  shared Matter aliases, когда несколько Atom используют один объект Mass.
- Сохранять сериализуемое содержимое атомарно и восстанавливать его после
  перезапуска Energy.
- Добавить версионирование Mass без переноса её содержимого в Boundary, Matrix
  или Force.
- Покрыть shared identity, restart, concurrent write и восстановление
  незавершённой записи тестами.

До реализации in-memory store является совместимым временным adapter, но не
целевым контрактом хранения.
