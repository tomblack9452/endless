// `npm run names:build`: the profanity list (profane-words.json) into the
// game's copy (src/nameWords.json) and the database's (the inserts in
// supabase/migrations/0009_name_filter.sql, between the BEGIN/END WORDS lines).
import { readFileSync, writeFileSync } from 'node:fs';

/** On the list, but also plain names and words a pilot might well pick. */
const ALLOW = new Set([
  'ike', 'ero', 'hom', 'hor', 'gai', 'yed', 'gub', 'wab', 'kwa', 'rse', 'ock', 'evl', 'gic', 'hui', 'uzi', 'lsd', 'pcp',
  'sob', 'nob', 'nog', 'armo', 'armos', 'crash', 'jerry', 'paddy', 'massa', 'trois', 'toots', 'vixen', 'willy', 'perse',
  'teste', 'hell', 'hells', 'leper', 'lusty', 'snuff', 'hooch', 'cocky', 'lynch', 'ninny', 'punky', 'jiggy', 'hoser',
  'whit', 'wang', 'yank', 'mick', 'floo', 'geni', 'deth', 'groe', 'orga', 'taff', 'rere', 'titi', 'hapa', 'nimrod',
  'foobar', 'doofus', 'dimwit', 'geezer', 'hummer', 'dingle', 'noonan', 'redleg', 'oneguy', 'onejar', 'chug', 'chugs',
  'clamps', 'boozer', 'stoned', 'stoner', 'licker', 'sucker', 'sucked', 'blacks', 'tawdry', 'seduce', 'sloper', 'junkie',
  'doggie', 'doggin', 'bootee', 'jigger', 'niggle', 'tiedup', 'turnon', 'quicky', 'testee', 'damn', 'crap',
]);

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i', '+': 't' };
const words = new Set();
for (const w of JSON.parse(readFileSync('scripts/name-filter/profane-words.json', 'utf8'))) {
  const n = String(w).toLowerCase().replace(/[0134578@$!+]/g, (c) => LEET[c]).replace(/[^a-z]/g, '');
  if (n.length >= 3 && !ALLOW.has(n)) words.add(n);
}
const list = [...words].sort();
writeFileSync('src/nameWords.json', JSON.stringify(list) + '\n');

const migration = 'supabase/migrations/0009_name_filter.sql';
const sql = readFileSync(migration, 'utf8');
const inserts = [];
for (let i = 0; i < list.length; i += 120) {
  inserts.push(`insert into public.name_words (word) values ${list.slice(i, i + 120).map((w) => `('${w}')`).join(', ')} on conflict do nothing;`);
}
const out = sql.replace(/(-- BEGIN WORDS\n)[\s\S]*?(-- END WORDS)/, `$1${inserts.join('\n')}\n$2`);
writeFileSync(migration, out);
console.log(`${list.length} words`);
