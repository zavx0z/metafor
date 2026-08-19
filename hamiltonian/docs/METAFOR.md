# `@metafor/*` в Hamiltonian

`@metafor/*` зарезервирован в release-модели Hamiltonian для загружаемой
функциональности самой MetaFor. Это граница между оркестратором и тем, что он
доставляет и запускает для Вселенной.

* `@hamiltonian/*` реализует устойчивый startup и механизм release.
* [`@internal/*`](INTERNAL.md) реализует сменяемые внутренние функции
  Hamiltonian.
* `@metafor/*` должен содержать функциональность MetaFor, не становясь частью
  внутреннего устройства оркестратора.

Сейчас в clean-room release нет принятого функционального `@metafor/*`
участника. Наличие workspace library или package name с этим scope само по себе
не включает его в Hamiltonian release и не выдаёт ему runtime authority.

До появления первого такого package должны быть отдельно приняты его предметный
владелец, поддерживаемые среды, lifecycle, public contract и включение в
release. Принятые свойства затем закрепляются в его собственном `README.md`.
До этого нельзя считать реализованными состав namespace, placement, transport,
обновление или связь с production-доменами.
