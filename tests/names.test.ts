import { describe, expect, it } from 'vitest';
import MIGRATION from '../supabase/migrations/0009_name_filter.sql?raw';
import { nameBlocked, STRONG } from '../src/nameFilter';
import WORDS from '../src/nameWords.json';
import { ALLOWED, REFUSED } from './nameCases';

// The pilot name filter in the game (the database's twin is tested in sql.test.ts).

const words = new Set(WORDS as string[]);

describe('pilot name filter', () => {
  it('refuses profanity, however it is spelt or split', () => {
    for (const n of REFUSED) expect(nameBlocked(n, words), n).toBe(true);
  });

  it('lets ordinary names through, even ones with a bad word inside', () => {
    for (const n of ALLOWED) expect(nameBlocked(n, words), n).toBe(false);
  });

  it('has the same strong roots as the database', () => {
    const m = /insert into public\.name_words \(word, strong\) values ([^;]+)/.exec(MIGRATION)![1];
    const db = [...m.matchAll(/\('([a-z]+)', true\)/g)].map((x) => x[1]);
    expect(db).toEqual(STRONG);
  });

  it('has the same words as the database', () => {
    const db = [...MIGRATION.split('-- BEGIN WORDS')[1].split('-- END WORDS')[0].matchAll(/\('([a-z]+)'\)/g)].map((x) => x[1]);
    expect(db).toEqual(WORDS);
  });
});
