const PUNCTUATION = /^[\s，。！？、；：“”"'（）\u3000,.!?;:()]+$/;

function isChineseChar(char) {
  return /[\u3400-\u9fff]/.test(char);
}

function serializeWord(row) {
  return {
    id: row.id,
    hanzi: row.hanzi,
    pinyin: row.pinyin,
    meaning_en: row.meaning_en,
    meaning_es: row.meaning_es,
    hsk_level: row.hsk_level,
    pos: row.pos,
    in_srs: Boolean(row.in_srs),
  };
}

export function tokenizeReadingContent(db, content) {
  const dictionary = db.prepare(`
    SELECT w.*, EXISTS(
      SELECT 1 FROM srs_cards sc WHERE sc.user_id = 1 AND sc.word_id = w.id
    ) as in_srs
    FROM words w
    ORDER BY length(w.hanzi) DESC
  `).all();
  const byHanzi = new Map(dictionary.map((word) => [word.hanzi, word]));
  const maxLength = dictionary.reduce((max, word) => Math.max(max, [...word.hanzi].length), 1);
  const chars = [...content];
  const tokens = [];
  let index = 0;

  while (index < chars.length) {
    const char = chars[index];

    if (PUNCTUATION.test(char)) {
      tokens.push({ id: `t${tokens.length}`, text: char, type: 'punctuation' });
      index += 1;
      continue;
    }

    let match = null;
    for (let length = Math.min(maxLength, chars.length - index); length > 0; length -= 1) {
      const candidate = chars.slice(index, index + length).join('');
      if (byHanzi.has(candidate)) {
        match = byHanzi.get(candidate);
        break;
      }
    }

    if (match) {
      tokens.push({ id: `t${tokens.length}`, text: match.hanzi, type: 'word', word: serializeWord(match) });
      index += [...match.hanzi].length;
      continue;
    }

    tokens.push({ id: `t${tokens.length}`, text: char, type: isChineseChar(char) ? 'unknown' : 'text' });
    index += 1;
  }

  return tokens;
}
