UPDATE actor 
SET snapshot = ?, timestamp = CURRENT_TIMESTAMP
WHERE id = ?;
