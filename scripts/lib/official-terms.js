//
// La lista oficial distingue acepciones con un dígito final —点1 en HSK 1,
// 点2 en HSK 2 y 点 en HSK 3— y marca partes opcionales entre paréntesis de
// anchura completa: 没（有）, 有（一）点儿. El mazo Anki que alimenta el corpus
// borra ambas notaciones, y por eso el corpus acaba con filas duplicadas que
// parecen errores y en realidad son sentidos distintos.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const dataDir = join(rootDir, 'data');

const SENSE_SUFFIX = /([0-9])$/;
const OPTIONAL_PART = /（([^）]*)）/;

export function parseOfficialTerm(raw) {
  let text = String(raw).trim();
  let senseIndex = null;

  const sense = SENSE_SUFFIX.exec(text);
  if (sense) {
    senseIndex = Number(sense[1]);
    text = text.slice(0, -1);
  }

  const optional = OPTIONAL_PART.exec(text);
  if (!optional) {
    return { form: text, sense_index: senseIndex, variants: [text] };
  }

  // La forma larga es la canónica: es la que aparece en los diccionarios y la
  // que el usuario encontrará escrita en los textos.
  const long = text.replace(OPTIONAL_PART, optional[1]);
  const short = text.replace(OPTIONAL_PART, '');

  return { form: long, sense_index: senseIndex, variants: [long, short] };
}

export function loadOfficialWords(level) {
  const file = join(dataDir, `HSK_Level_${level}_words.txt`);

  return readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseOfficialTerm);
}

export function loadOfficialCharacters(level) {
  const file = join(dataDir, `HSK_Level_${level}_hanzi.txt`);

  return readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}
