SELECT sql FROM sqlite_master 
WHERE type IN ('index', 'view', 'trigger') AND sql IS NOT NULL
