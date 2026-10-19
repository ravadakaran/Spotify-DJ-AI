export function createThrottle({
  limit = 30,
  windowMs = 60000,
  maxKeys = 10000,
  now = Date.now,
} = {}) {
  const entries = new Map();
  return (key) => {
    const time = now();
    for (const [id, record] of entries)
      if (record.until <= time) entries.delete(id);
    let record = entries.get(key);
    if (!record) {
      if (entries.size >= maxKeys) return false;
      record = { count: 0, until: time + windowMs };
      entries.set(key, record);
    }
    return ++record.count <= limit;
  };
}
