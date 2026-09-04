export interface DictionaryEntry {
  id?: number;
  hanzi: string;
  pinyin: string;
  meaning_en?: string;
  meaning_es?: string | null;
  hsk_level?: number;
  pos?: string | null;
  frequency?: number | null;
  in_srs?: boolean;
  sense_index?: number | null;
  variants?: string[];
  traditional?: string | null;
  classifier?: string | null;
}

export interface ReadingToken {
  id: string;
  text: string;
  type: 'word' | 'unknown' | 'punctuation';
  word: DictionaryEntry | null;
  senses?: DictionaryEntry[];
}

export function tokenizeReading(
  content: string,
  dictionary: DictionaryEntry[],
): ReadingToken[] {
  const wordsByFirstCharacter = new Map<string, DictionaryEntry[]>();

  for (const word of dictionary) {
    const firstCharacter = Array.from(word.hanzi)[0];
    if (!firstCharacter) {
      continue;
    }

    const candidates = wordsByFirstCharacter.get(firstCharacter) ?? [];
    candidates.push(word);
    wordsByFirstCharacter.set(firstCharacter, candidates);
  }

  for (const candidates of wordsByFirstCharacter.values()) {
    candidates.sort((left, right) => right.hanzi.length - left.hanzi.length);
  }

  const tokens: ReadingToken[] = [];
  let offset = 0;

  while (offset < content.length) {
    const text = Array.from(content.slice(offset))[0];
    const word = (wordsByFirstCharacter.get(text) ?? []).find(candidate =>
      content.startsWith(candidate.hanzi, offset),
    );

    if (word) {
      const senses = (wordsByFirstCharacter.get(text) ?? [])
        .filter(candidate => candidate.hanzi === word.hanzi);
      tokens.push({
        id: `t${offset}`,
        text: word.hanzi,
        type: 'word',
        word,
        ...(senses.length > 1 ? { senses } : {}),
      });
      offset += word.hanzi.length;
      continue;
    }

    tokens.push({
      id: `t${offset}`,
      text,
      type: /\p{Script=Han}/u.test(text) ? 'unknown' : 'punctuation',
      word: null,
    });
    offset += text.length;
  }

  return tokens;
}
