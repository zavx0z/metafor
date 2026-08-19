# NODES-016 — Артефакты

## component-playground.png

* Источник: exact canvas PNG страницы `http://127.0.0.1:4016/`, полученный
  через `@meta/chrome` REST API из CDP target
  `1E982897F323D83C771E45E6CA2C4C7C`.
* Дата: 2026-08-19.
* Версия проекта: `codex/node-layot`, result slice после `d0c472641`.
* Ожидание: цельный Flexbox-каталог с universal fields слева, Node Editor с
  нодами, Socket и Link по центру и полным Socket catalog снизу; без наложений
  панелей, пустого canvas и отсоединённых Link endpoints.
* Фактическое наблюдение: все три Flex regions видимы; 10 field kinds показаны
  standalone и внутри Node, 19 Socket kinds и 6 shapes присутствуют; Links
  приходят в exact Socket centers, container background расположен под Links,
  Node chrome — над ними. Canvas `3840×2176`, browser console пуст.
* Контрольная сумма: SHA-256
  `0fa6af2a527d5c721fea14fb17c5e8b82d50cb635e2c95b9c744169dc179ad38`.
