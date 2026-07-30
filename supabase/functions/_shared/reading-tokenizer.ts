export interface DictionaryWord {
  id: number;
  hanzi: string;
  pinyin: string;
  meaning_en: string;
  meaning_es: string | null;
  hsk_level: number;
  pos: string | null;
  frequency: number | null;
  in_srs: boolean;
}

export interface ReadingToken {
  id: string;
  text: string;
  type: 'word' | 'unknown' | 'punctuation';
  word: DictionaryWord | null;
}

export function tokenizeReading(
  content: string,
  dictionary: DictionaryWord[],
): ReadingToken[] {
  const wordsByFirstCharacter = new Map<string, DictionaryWord[]>();

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
      tokens.push({
        id: `t${offset}`,
        text: word.hanzi,
        type: 'word',
        word,
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
