// Pilot names: no profanity. The same check runs in the database
// (name_blocked() in supabase/migrations/0009_name_filter.sql), which has the
// last word; this one answers at once, before the name goes anywhere.
//
// A name is turned into words (split at spaces, - and _, and between a small
// and a capital letter: "BigDick" is "big dick"), each read twice: with
// leetspeak undone ("5h1t" is "shit") and with digits dropped ("Dick69").
// It's refused if any word, or the whole name run together, is on the list,
// or if it contains one of a few roots that are never innocent anywhere in a
// word. Words on the list that are also plain names or words (crash, jerry,
// tester...) are let through: see ALLOW in scripts/name-filter/build.mjs.

/** Roots refused anywhere in a name, however it's spelt around them. */
export const STRONG = [
  'fuck', 'fuk', 'shit', 'cunt', 'nigg', 'fagg', 'faggot', 'whore', 'slut', 'bitch', 'penis', 'pussy', 'porn',
  'jizz', 'twat', 'wank', 'dildo', 'boob', 'kike', 'chink', 'retard', 'nazi', 'hitler', 'sperm', 'vagina', 'clit',
  'hentai', 'rapist', 'molest', 'asshole', 'bastard', 'bollock', 'cocksuck', 'motherf', 'blowjob', 'handjob', 'skank',
];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b' };

/** The name's words, each spelt both ways (leetspeak undone; digits dropped). */
export function nameForms(name: string): { leet: string[]; plain: string[] } {
  const raw = name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[ _-]+/).filter(Boolean);
  return {
    leet: raw.map((w) => w.replace(/[0134578]/g, (c) => LEET[c]).replace(/[^a-z]/g, '')),
    plain: raw.map((w) => w.replace(/[^a-z]/g, '')),
  };
}

/** Is this name refused? `words`: the list (src/nameWords.json). */
export function nameBlocked(name: string, words: ReadonlySet<string>): boolean {
  const f = nameForms(name);
  for (const form of [f.leet, f.plain]) {
    if (form.some((w) => words.has(w))) return true;
    const all = form.join('');
    if (words.has(all) || STRONG.some((s) => all.includes(s))) return true;
  }
  return false;
}
