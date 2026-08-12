# HAM-001 — Артефакты

## `server-incarnation-duplicate-rtc.png`

* Источник: переданный владельцем screenshot живой Hamiltonian scene;
  оригинальное имя `Снимок экрана 2026-08-12 в 19.07.06.png`.
* Дата: 12 августа 2026 года.
* Версия проекта: страница от host version `mf-428-3-live`; после restart
  одновременно наблюдался host version `mf-428-5-live` поверх baseline
  `ffc70e291542838e55485c12e2b5ec91ae181c11` и ещё не зафиксированного на тот
  момент presentation patch MF-428.5. Ни этот patch, ни параллельный NODES-008
  не изменяли lifecycle ownership или `parentId`.
* Ожидание владельца: после полного restart Hamiltonian в scene находится одна
  текущая server incarnation; её RTCPeerConnection вложен в exact Peer process
  внутри контейнера `Сервер`.
* Фактическое наблюдение: старый connected RTCPeerConnection остаётся внутри
  старого Peer process/server subtree, а RTC новой host incarnation в состоянии
  `new` одновременно показан отдельной корневой нодой над контейнером. Снимок
  доказывает смешение двух server declarations, но сам по себе не устанавливает
  внутреннюю причину.
* Последующая read-only локализация: старая page declaration удерживала
  `server:9f42bb94-…`; новый snapshot имел `server:dc8b3fca-…`. Transport сделал
  новый RTC видимым при невидимом новом owner, поэтому `parentId` стал `null`.
  Frozen probe воспроизвёл тот же результат без browser и layout.
* Чувствительные сведения: секретов нет; видны localhost, временные runtime
  identity, session IDs и PID испытательного контура.
* Размер: `924 × 1324`, `113920` байт.
* Внешний оригинал: временный macOS screenshot был скопирован в устойчивую
  директорию задачи без преобразования.
* Контрольная сумма SHA-256:
  `87d27157ce975f1c5f82e8bceef58fb0a9a8b80e68f514d8bf896c82618f0de4`.
