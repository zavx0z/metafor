-- Корневая запись значения. Только uuid + kind (дискриминатор).
-- Реальные данные лежат в типизированных подтаблицах ниже.
CREATE TABLE IF NOT EXISTS value
(
    uuid TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    kind TEXT NOT NULL CHECK (kind IN ('null', 'boolean', 'number', 'string', 'enum', 'list'))
);

-- Скалярные подтаблицы. Каждая хранит ровно одну колонку нативного типа.
-- Принадлежность value к подтаблице определяется значением value.kind.
-- Для kind='null' и kind='list' нет своей подтаблицы (null — отсутствие записей,
-- list — элементы лежат в value_list_item_*).

CREATE TABLE IF NOT EXISTS value_boolean
(
    value   TEXT PRIMARY KEY CHECK (length(trim(value)) > 0),
    boolean INTEGER NOT NULL CHECK (boolean IN (0, 1)),
    FOREIGN KEY (value) REFERENCES value (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS value_number
(
    value  TEXT PRIMARY KEY CHECK (length(trim(value)) > 0),
    number REAL NOT NULL,
    FOREIGN KEY (value) REFERENCES value (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS value_string
(
    value TEXT PRIMARY KEY CHECK (length(trim(value)) > 0),
    text  TEXT NOT NULL,
    FOREIGN KEY (value) REFERENCES value (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS value_enum
(
    value   TEXT PRIMARY KEY CHECK (length(trim(value)) > 0),
    variant TEXT NOT NULL CHECK (length(trim(variant)) > 0),
    FOREIGN KEY (value) REFERENCES value (uuid) ON DELETE CASCADE,
    FOREIGN KEY (variant) REFERENCES field_enum_variant (uuid) ON DELETE CASCADE
);

-- Корневая таблица элемента списочного значения (когда value.kind = 'list').
-- Только пара (value, position) + дискриминатор kind. Реальные данные —
-- в типизированных value_list_item_* таблицах.
CREATE TABLE IF NOT EXISTS value_list_item
(
    value    TEXT    NOT NULL CHECK (length(trim(value)) > 0),
    position INTEGER NOT NULL CHECK (position >= 0),
    kind     TEXT    NOT NULL CHECK (kind IN ('null', 'boolean', 'number', 'string', 'enum')),
    PRIMARY KEY (value, position),
    FOREIGN KEY (value) REFERENCES value (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS value_list_item_boolean
(
    value    TEXT    NOT NULL CHECK (length(trim(value)) > 0),
    position INTEGER NOT NULL CHECK (position >= 0),
    boolean  INTEGER NOT NULL CHECK (boolean IN (0, 1)),
    PRIMARY KEY (value, position),
    FOREIGN KEY (value, position) REFERENCES value_list_item (value, position) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS value_list_item_number
(
    value    TEXT    NOT NULL CHECK (length(trim(value)) > 0),
    position INTEGER NOT NULL CHECK (position >= 0),
    number   REAL    NOT NULL,
    PRIMARY KEY (value, position),
    FOREIGN KEY (value, position) REFERENCES value_list_item (value, position) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS value_list_item_string
(
    value    TEXT    NOT NULL CHECK (length(trim(value)) > 0),
    position INTEGER NOT NULL CHECK (position >= 0),
    text     TEXT    NOT NULL,
    PRIMARY KEY (value, position),
    FOREIGN KEY (value, position) REFERENCES value_list_item (value, position) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS value_list_item_enum
(
    value    TEXT    NOT NULL CHECK (length(trim(value)) > 0),
    position INTEGER NOT NULL CHECK (position >= 0),
    variant  TEXT    NOT NULL CHECK (length(trim(variant)) > 0),
    PRIMARY KEY (value, position),
    FOREIGN KEY (value, position) REFERENCES value_list_item (value, position) ON DELETE CASCADE,
    FOREIGN KEY (variant) REFERENCES field_enum_variant (uuid) ON DELETE CASCADE
);
