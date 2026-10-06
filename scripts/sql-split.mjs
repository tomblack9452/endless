// Splits SQL into statements (aware of comments, quotes and $$ bodies) and packs
// them into parts that each stay under a size. Used by build-setup-sql.mjs, and
// tested in tests/sql.test.ts.

/** The statements in `sql`, each with the comments in front of it, trimmed. */
export function statements(sql) {
  const out = [];
  let start = 0;
  let i = 0;
  let inDollar = false;
  while (i < sql.length) {
    const c = sql[i];
    const two = sql.slice(i, i + 2);
    if (inDollar) {
      if (two === '$$') {
        inDollar = false;
        i += 2;
      } else i++;
    } else if (two === '--') {
      while (i < sql.length && sql[i] !== '\n') i++;
    } else if (two === '$$') {
      inDollar = true;
      i += 2;
    } else if (c === "'") {
      i++;
      while (i < sql.length && !(sql[i] === "'" && sql[i + 1] !== "'")) i += sql[i] === "'" ? 2 : 1;
      i++;
    } else if (c === ';') {
      out.push(sql.slice(start, i + 1).trim());
      start = i + 1;
      i++;
    } else i++;
  }
  const rest = sql.slice(start).trim();
  if (rest && !/^(--[^\n]*\n?\s*)*$/.test(rest)) out.push(rest);
  return out;
}

/** Packs statements, in order, into parts of at most `limit` bytes. Throws if one statement alone is over. */
export function parts(sql, limit) {
  const result = [];
  let current = '';
  for (const s of statements(sql)) {
    const size = Buffer.byteLength(s) + 2;
    if (size > limit) throw new Error(`one statement is ${size} bytes, over the ${limit} limit:\n${s.slice(0, 120)}...`);
    if (Buffer.byteLength(current) + size > limit && current) {
      result.push(current);
      current = '';
    }
    current += (current ? '\n\n' : '') + s;
  }
  if (current) result.push(current);
  return result;
}
