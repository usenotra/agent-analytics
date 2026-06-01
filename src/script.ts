/**
 * Lua script that ingests a single event occurrence.
 *
 * `KEYS[1]` is the full hash key (`<prefix>:event:<data-hash>:<hourInt>`).
 *
 * `ARGV` layout:
 *   ARGV[1] = ttl in seconds
 *   ARGV[2] = hourInt (stored as a field so the search index can range/group on it)
 *   ARGV[3] = number of metadata pairs (n)
 *   ARGV[4..] = key1, value1, key2, value2, ... (the dimensions behind the hash)
 *
 * Behaviour: always bump the `count` counter. The very first time the counter
 * is created (HINCRBY returns 1) we also write the immutable metadata and set
 * the expiry — there's no point rewriting them on every hit.
 *
 * Returns the new counter value.
 */
export const INGEST_SCRIPT = `
local count = redis.call('HINCRBY', KEYS[1], 'count', 1)
if count == 1 then
  redis.call('HSET', KEYS[1], 'hourInt', ARGV[2])
  local n = tonumber(ARGV[3])
  for i = 1, n do
    redis.call('HSET', KEYS[1], ARGV[2 + 2 * i], ARGV[3 + 2 * i])
  end
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
end
return count
`;
