/**
 * Lua script that ingests a single event occurrence.
 *
 * `KEYS[1]` is the full hash key (`<prefix>:event:<data-hash>:<hour>`).
 *
 * `ARGV` layout:
 *   ARGV[1] = ttl in seconds
 *   ARGV[2] = hour bucket (stored as a field so the search index can range/group on it)
 *   ARGV[3..] = key1, value1, key2, value2, ... (the dimensions behind the hash)
 *
 * Behaviour: always bump the `count` counter. The very first time the counter
 * is created (HINCRBY returns 1) we also write the immutable metadata (in a
 * single variadic HSET) and set the expiry — there's no point rewriting them on
 * every hit.
 *
 * Returns the new counter value.
 */
export const INGEST_SCRIPT = `
local count = redis.call('HINCRBY', KEYS[1], 'count', 1)
if count == 1 then
  local fields = {'hour', ARGV[2]}
  for i = 3, #ARGV do
    fields[#fields + 1] = ARGV[i]
  end
  redis.call('HSET', KEYS[1], unpack(fields))
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
end
return count
`;
