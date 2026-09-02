//
// La columna de diccionario del corpus fuente es HTML de CC-CEDICT con un
// bloque <ul> por lectura, precedido de su <span class="pinYinWrapper">. El
// importador anterior puntuaba los bloques con una heurística y elegía uno
// solo por hanzi, así que 还 hái y 还 huán acababan con la misma glosa. Aquí
// se conserva el emparejamiento lectura → significados, que es la información
// que permite que cada fila del corpus sea un sentido y no una forma escrita.
import { normalizePinyin } from '../../packages/domain/src/pinyin.ts';

const SENSE_BLOCK = /<span class="pinYinWrapper">([\s\S]*?)<\/span>\s*<ul>([\s\S]*?)<\/ul>/g;
const TRADITIONAL = /<span id="char-trad-id">[\s\S]*?<span[^>]*>([^<]*)<\/span>/;
const LIST_ITEM = /<li>([\s\S]*?)<\/li>/g;
const CLASSIFIER = /\bCL:([^);]+?)(?=\)|;|$)/g;
const CROSS_REFERENCE = /^(old )?variant of |^used in /;

function stripTags(html) {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

// "個|个[ge4],位[wei4]" -> ["个", "位"]. CC-CEDICT escribe tradicional|simplificado
// y la lectura entre corchetes; nos quedamos con la forma simplificada.
function parseClassifiers(raw) {
  return raw
    .split(',')
    .map((entry) => entry.replace(/\[[^\]]*\]/g, '').trim())
    .map((entry) => entry.split('|').pop().trim())
    .filter(Boolean);
}

function removeClassifiers(text) {
  const classifiers = [];
  const cleaned = text
    .replace(CLASSIFIER, (_, raw) => {
      classifiers.push(...parseClassifiers(raw));
      return '';
    })
    .replace(/\(\s*\)/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([;,])/g, '$1')
    .replace(/^\s*[;,]\s*/, '')
    .trim();

  return { cleaned, classifiers };
}

export function parseDictionaryEntry(html) {
  const source = html ?? '';
  const traditionalMatch = TRADITIONAL.exec(source);
  const traditional = traditionalMatch ? stripTags(traditionalMatch[1]) : null;

  const readings = [];
  SENSE_BLOCK.lastIndex = 0;

  let block;
  while ((block = SENSE_BLOCK.exec(source)) !== null) {
    const reading = stripTags(block[1]);
    const meanings = [];
    const classifiers = [];

    LIST_ITEM.lastIndex = 0;
    let item;
    while ((item = LIST_ITEM.exec(block[2])) !== null) {
      const text = stripTags(item[1]);
      if (!text) {
        continue;
      }

      const withoutClassifiers = removeClassifiers(text);
      classifiers.push(...withoutClassifiers.classifiers);

      if (!withoutClassifiers.cleaned) {
        continue;
      }

      if (CROSS_REFERENCE.test(withoutClassifiers.cleaned)) {
        continue;
      }

      meanings.push(withoutClassifiers.cleaned);
    }

    if (meanings.length > 0) {
      readings.push({ reading, meanings, classifiers });
    }
  }

  return { traditional, readings };
}

export function selectReading(entry, pinyin) {
  const exact = entry.readings.find((reading) => reading.reading === pinyin);
  if (exact) {
    return exact;
  }

  // La columna de pinyin puede traer alternativas separadas por barra ("shéi/shuí").
  for (const variant of String(pinyin).split('/')) {
    const target = normalizePinyin(variant);
    const candidates = entry.readings.filter(
      (reading) => normalizePinyin(reading.reading) === target,
    );

    if (candidates.length > 0) {
      // CC-CEDICT pone en mayúscula la lectura de apellido ("Huán" frente a
      // "huán"). Con el tono normalizado ya no se distinguen, así que la
      // mayúscula inicial es lo único que las separa: gana la común.
      const common = candidates.find(
        (reading) => reading.reading[0] === reading.reading[0].toLowerCase(),
      );
      return common ?? candidates[0];
    }
  }

  return null;
}
