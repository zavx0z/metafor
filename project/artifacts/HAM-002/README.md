# HAM-002 — Артефакты

## Снимок экрана 2026-08-13 в 16.30.45.png

* Источник: снимок владельца текущей страницы Hamiltonian после ошибки
  инициализации WebGPU adapter.
* Дата: 13 августа 2026 года.
* Версия проекта: наблюдавшийся runtime не используется как доказательство
  текущего checkout; source baseline задачи —
  `main@44433c8a1672e7cbd974bc22498c00f8338865cb`.
* Ожидание: увидеть единственную нодовую визуализацию Hamiltonian.
* Фактическое наблюдение: canvas скрыт, а вместо него показан legacy fallback
  screen со status grid, identity dump, управляющими кнопками, topology и event
  log.
* Чувствительные сведения: снимок содержит локальные runtime UUID, PID и
  browser chrome; бинарный файл в Git не добавляется.
* Внешний оригинал:
  `/Users/zavx0z/Desktop/Снимок экрана 2026-08-13 в 16.30.45.png`.
* Контрольная сумма SHA-256:
  `b56d6b00df701dfab45b4ca9c850628a0822a737d0f63fc3f6abeaf023e72e04`.

## ham-002-7-cdp-v2.png

* Источник: exact dedicated CDP target
  `7B227055B2489360CD83F7790823F8FF`, снятый через `@meta/chrome`
  `POST /cdp/screenshot` после вывода target на передний план.
* Дата: 13 августа 2026 года.
* Версия проекта: canonical `main@7244f26d802be3966cb4b641398459a11f9c9fe0`;
  последний product checkpoint `50c1bf627ebdae0cd396865e483761ebcd954fea`;
  host version `v2`; browser source revision
  `source:982aabedd7f12e1e6c96970bcb7c666b27b4c2d45f5d32c5f778abe6bd10c7f9`.
* Ожидание: увидеть полноэкранный нодовый canvas Hamiltonian v2 с 23 нодами
  и 19 связями, компактными HUD-вкладками и без резервного текстового экрана,
  status grid, кнопок и event log.
* Фактическое наблюдение: виден только непустой нодовый граф с цветными
  связями; вкладка «Холст» пристыкована слева, compact fullscreen control —
  справа. Legacy fallback, status grid, buttons и event log отсутствуют.
  В момент capture DOM/runtime сообщил `scene=ready`, `status=live`, `23 ноды ·
  19 связей`, canvas `3840×2176` (`1920×1088` CSS px),
  `spatialRuntime=verified`, `graphLayer=space-display`, `windowLayer=hud`.
  Все 32 legacy selectors и четыре legacy strings отсутствовали; два console
  captures вернули `0 entries`. Количество live lifecycle nodes/edges может
  меняться после capture без смены visual contour.
* Контрольная сумма SHA-256:
  `2f80b91370c860202a180c248a2aa23a13c08513b5f360e9a2f5046aeab4847d`.
