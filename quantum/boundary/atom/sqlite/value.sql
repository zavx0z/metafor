-- Корневая запись значения. Только id + kind (дискриминатор).
-- Реальные данные лежат в типизированных подтаблицах ниже (по аналогии с
-- field_default → field_<type>_default в meta-схеме).
CREATE TABLE IF NOT EXISTS value
(
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL CHECK (kind IN ('null', 'boolean', 'number', 'string', 'enum', 'list'))
);

-- Скалярные подтаблицы. Каждая хранит ровно одну колонку нативного типа.
-- Принадлежность value к подтаблице определяется значением value.kind.
-- Для kind='null' и kind='list' своей подтаблицы нет (null — отсутствие записей,
-- list — элементы лежат в value_list_item).

CREATE TABLE IF NOT EXISTS value_boolean
(
    value   INTEGER PRIMARY KEY,
    boolean INTEGER NOT NULL CHECK (boolean IN (0, 1)),
    FOREIGN KEY (value) REFERENCES value (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS value_number
(
    value  INTEGER PRIMARY KEY,
    number REAL NOT NULL,
    FOREIGN KEY (value) REFERENCES value (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS value_string
(
    value INTEGER PRIMARY KEY,
    text  TEXT NOT NULL,
    FOREIGN KEY (value) REFERENCES value (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS value_enum
(
    value   INTEGER PRIMARY KEY,
    variant INTEGER NOT NULL,
    FOREIGN KEY (value) REFERENCES value (id) ON DELETE CASCADE,
    FOREIGN KEY (variant) REFERENCES field_enum_variant (id) ON DELETE CASCADE
);

-- Элементы списочного значения (когда value.kind = 'list').
-- По аналогии с field_array_default_item в meta-схеме: плоская таблица,
-- одна колонка item_value TEXT NOT NULL. Тип элемента восстанавливается
-- runtime-кодом через meta-схему родительского поля.
CREATE TABLE IF NOT EXISTS value_list_item
(
    value      INTEGER NOT NULL,
    position   INTEGER NOT NULL CHECK (position >= 0),
    item_value TEXT    NOT NULL,
    PRIMARY KEY (value, position),
    FOREIGN KEY (value) REFERENCES value (id) ON DELETE CASCADE
);
