// packages/domain/src/expression/compare-pinyin.ts
//
// Inteligibilidad, no evaluación de tonos. El reconocedor de voz devuelve
// hanzi, y su modelo de lenguaje corrige tonos mal dichos en palabras
// frecuentes; lo que aquí se compara es el pinyin de diccionario de esos
// hanzi contra el esperado. Por eso un homófono (事 por 是) es un acierto, y por
// eso la pantalla dice «se te entendió», nunca «tono correcto».
//
// Las sílabas se escriben como base + tono numérico: `xue2`, `sheng5`. La ü es
// `v`. El tono neutro es 5; algunos conversores lo escriben 0.

const SYLLABLE_INVENTORY = `
a ai an ang ao e ei en eng er o ou
yi ya yan yang yao ye yin ying yo yong you yu yuan yue yun
wu wa wai wan wang wei wen weng wo
ba bai ban bang bao bei ben beng bi bian biao bie bin bing bo bu
pa pai pan pang pao pei pen peng pi pian piao pie pin ping po pou pu
ma mai man mang mao me mei men meng mi mian miao mie min ming miu mo mou mu
fa fan fang fei fen feng fo fou fu
da dai dan dang dao de dei den deng di dia dian diao die ding diu dong dou du duan dui dun duo
ta tai tan tang tao te tei teng ti tian tiao tie ting tong tou tu tuan tui tun tuo
na nai nan nang nao ne nei nen neng ni nian niang niao nie nin ning niu nong nou nu nuan nun nuo nv nve
la lai lan lang lao le lei leng li lia lian liang liao lie lin ling liu lo long lou lu luan lun luo lv lve
ga gai gan gang gao ge gei gen geng gong gou gu gua guai guan guang gui gun guo
ka kai kan kang kao ke kei ken keng kong kou ku kua kuai kuan kuang kui kun kuo
ha hai han hang hao he hei hen heng hong hou hu hua huai huan huang hui hun huo
ji jia jian jiang jiao jie jin jing jiong jiu ju juan jue jun
qi qia qian qiang qiao qie qin qing qiong qiu qu quan que qun
xi xia xian xiang xiao xie xin xing xiong xiu xu xuan xue xun
zha zhai zhan zhang zhao zhe zhei zhen zheng zhi zhong zhou zhu zhua zhuai zhuan zhuang zhui zhun zhuo
cha chai chan chang chao che chen cheng chi chong chou chu chua chuai chuan chuang chui chun chuo
sha shai shan shang shao she shei shen sheng shi shou shu shua shuai shuan shuang shui shun shuo
ran rang rao re ren reng ri rong rou ru rua ruan rui run ruo
za zai zan zang zao ze zei zen zeng zi zong zou zu zuan zui zun zuo
ca cai can cang cao ce cen ceng ci cong cou cu cuan cui cun cuo
sa sai san sang sao se sen seng si song sou su suan sui sun suo
`;

const SYLLABLES = new Set(SYLLABLE_INVENTORY.split(/\s+/).filter(Boolean));
const LONGEST_SYLLABLE = 6;
const NEUTRAL = 5;

const TONE_MARKS: Record<string, number> = {
  '̄': 1,
  '́': 2,
  '̌': 3,
  '̀': 4,
};
const DIAERESIS = '̈';
const SEPARATOR = /[\s'’·\-,.;:!?，。？！、]/;

// 不 y 一 cambian de tono según la sílaba siguiente. El corpus marca el tono
// ya cambiado (bú kèqi); un conversor puede dar el de diccionario (bu4).
const SANDHI_TONES: Record<string, ReadonlySet<number>> = {
  yi: new Set([1, 2, 4]),
  bu: new Set([2, 4]),
};

interface Syllable {
  base: string;
  tone: number;
}

interface Chunk {
  letters: string[];
  tones: Array<number | null>;
  /** Posiciones donde la sílaba tiene que terminar (detrás de un dígito de tono). */
  cuts: Set<number>;
}

function notPinyin(input: string): Error {
  return new Error(`no es pinyin: «${input}»`);
}

function chunksOf(input: string): Chunk[] {
  const chunks: Chunk[] = [];
  let current: Chunk = { letters: [], tones: [], cuts: new Set() };
  const flush = () => {
    if (current.letters.length > 0) chunks.push(current);
    current = { letters: [], tones: [], cuts: new Set() };
  };

  const chars = [...input.toLowerCase().normalize('NFD')];
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    const last = current.letters.length - 1;

    if (char >= 'a' && char <= 'z') {
      current.letters.push(char);
      current.tones.push(null);
    } else if (char in TONE_MARKS && last >= 0) {
      current.tones[last] = TONE_MARKS[char];
    } else if (char === DIAERESIS && current.letters[last] === 'u') {
      current.letters[last] = 'v';
    } else if (char === ':' && current.letters[last] === 'u') {
      current.letters[last] = 'v';
    } else if (/[0-5]/.test(char) && last >= 0) {
      const digit = Number(char);
      current.tones[last] = digit === 0 ? NEUTRAL : digit;
      current.cuts.add(current.letters.length);
    } else if (SEPARATOR.test(char)) {
      flush();
    } else {
      throw notPinyin(input);
    }
  }
  flush();
  return chunks;
}

function segment(chunk: Chunk, input: string): Syllable[] {
  const { letters, tones, cuts } = chunk;
  const failed = new Set<number>();

  const from = (start: number): Array<[number, number]> | null => {
    if (start === letters.length) return [];
    if (failed.has(start)) return null;

    const maxEnd = Math.min(letters.length, start + LONGEST_SYLLABLE);
    for (let end = maxEnd; end > start; end--) {
      // Una sílaba no puede saltarse el final que marca un dígito de tono.
      let crossesCut = false;
      for (let cut = start + 1; cut < end; cut++) {
        if (cuts.has(cut)) crossesCut = true;
      }
      if (crossesCut) continue;

      const text = letters.slice(start, end).join('');
      // La r final del erhua se pega a la sílaba anterior y no se puntúa.
      const isErhua = text === 'r' && end === letters.length && start > 0;
      if (!SYLLABLES.has(text) && !isErhua) continue;

      const rest = from(end);
      if (rest) return [[start, end], ...rest];
    }
    failed.add(start);
    return null;
  };

  const spans = from(0);
  if (!spans) throw notPinyin(input);

  return spans
    .filter(([start, end]) => !(end - start === 1 && letters[start] === 'r'))
    .map(([start, end]) => {
      const tone = tones.slice(start, end).find((t) => t !== null) ?? NEUTRAL;
      return { base: letters.slice(start, end).join(''), tone };
    });
}

function parse(input: string): Syllable[] {
  return chunksOf(input).flatMap((chunk) => segment(chunk, input));
}

/** `'wǒ shì xuésheng'` → `['wo3', 'shi4', 'xue2', 'sheng5']`. */
export function parsePinyinSyllables(input: string): string[] {
  return parse(input).map((s) => `${s.base}${s.tone}`);
}

function toneMatches(expected: Syllable, heard: Syllable): boolean {
  if (expected.base !== heard.base) return false;
  if (expected.tone === NEUTRAL) return true;
  if (expected.tone === heard.tone) return true;
  const sandhi = SANDHI_TONES[expected.base];
  return Boolean(sandhi && sandhi.has(expected.tone) && sandhi.has(heard.tone));
}

/** Pares (i esperado, j oído) con la misma base, en orden: subsecuencia común más larga. */
function alignByBase(expected: Syllable[], heard: Syllable[]): Array<[number, number]> {
  const n = expected.length;
  const m = heard.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = expected[i].base === heard[j].base
        ? lcs[i + 1][j + 1] + 1
        : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (expected[i].base === heard[j].base) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}

export interface PinyinComparison {
  syllables: Array<{ expected: string; heard: string | null; ok: boolean }>;
  /** ≥ 80 % de sílabas bien y, si hay palabra objetivo, todas sus sílabas tónicas. */
  intelligible: boolean;
}

export const INTELLIGIBLE_RATIO = 0.8;

export function comparePinyin(
  expected: string,
  heard: string,
  options: { targetWord?: string } = {},
): PinyinComparison {
  const want = parse(expected);
  if (want.length === 0) throw new Error('comparePinyin: no hay nada esperado');
  const got = parse(heard);

  const heardFor: Array<Syllable | null> = new Array(want.length).fill(null);
  const anchors = alignByBase(want, got);
  // Entre dos anclas, lo esperado y lo oído se emparejan por posición: así una
  // sílaba mal dicha muestra qué se oyó en su lugar.
  let prevI = -1;
  let prevJ = -1;
  for (const [ai, aj] of [...anchors, [want.length, got.length] as [number, number]]) {
    for (let k = 0; prevI + 1 + k < ai && prevJ + 1 + k < aj; k++) {
      heardFor[prevI + 1 + k] = got[prevJ + 1 + k];
    }
    if (ai < want.length) heardFor[ai] = got[aj];
    prevI = ai;
    prevJ = aj;
  }

  const syllables = want.map((syllable, index) => {
    const match = heardFor[index];
    return {
      expected: `${syllable.base}${syllable.tone}`,
      heard: match ? `${match.base}${match.tone}` : null,
      ok: match !== null && toneMatches(syllable, match),
    };
  });

  const okCount = syllables.filter((s) => s.ok).length;
  let intelligible = okCount / want.length >= INTELLIGIBLE_RATIO;

  if (options.targetWord !== undefined) {
    const target = parse(options.targetWord);
    const start = want.findIndex((_, i) =>
      target.length > 0 && target.every((t, k) => want[i + k]?.base === t.base),
    );
    if (start < 0) {
      throw new Error(`la palabra objetivo «${options.targetWord}» no está en «${expected}»`);
    }
    const tonalOk = target.every(
      (_, k) => want[start + k].tone === NEUTRAL || syllables[start + k].ok,
    );
    intelligible = intelligible && tonalOk;
  }

  return { syllables, intelligible };
}
