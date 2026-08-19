# NODES-015 — visual evidence

* `owner-before.png` — два независимых controls: scenario уже называет policy,
  но второй select позволяет выбрать противоположную.
* `fixed-preset-after.png` — один scenario select и read-only «Политика
  сценария: Фиксированная»; показан только текущий fixed result без stale
  adaptive comparison.

Browser evidence получено через точный `ai-macos` CDP target
`116F2A03988C2FA4FD5515BDAE7A83F5`. Long-lived Bun HMR один раз вернул
`Failed to load bundled module './client.ts'`; принадлежащий задаче playground
server был чисто перезапущен, после чего повторный proof и console capture
прошли, console содержит 0 entries. Hamiltonian/CDP Chrome не перезапускались.
