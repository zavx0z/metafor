CREATE TABLE
    IF NOT EXISTS meta (
        tag TEXT PRIMARY KEY,
        fingerprint TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

CREATE TABLE
    IF NOT EXISTS actor (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        meta_tag TEXT NOT NULL,
        parent_id INTEGER,
        idx INTEGER NOT NULL,
        snapshot TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (parent_id) REFERENCES actor (id) ON DELETE CASCADE,
        FOREIGN KEY (meta_tag) REFERENCES meta (tag) ON DELETE CASCADE,
        UNIQUE (meta_tag, parent_id)
    );

CREATE TABLE
    IF NOT EXISTS patch (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_id INTEGER NOT NULL,
        op TEXT NOT NULL,
        path TEXT NOT NULL,
        value TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (actor_id) REFERENCES actor (id) ON DELETE CASCADE
    );

-- Создаем индексы для ускорения поиска
CREATE INDEX IF NOT EXISTS idx_actor_tag ON actor (meta_tag);

CREATE INDEX IF NOT EXISTS idx_actor_parent ON actor (parent_id);

CREATE INDEX IF NOT EXISTS idx_patch_actor ON patch (actor_id);