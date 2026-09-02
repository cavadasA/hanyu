import { parseDictionaryEntry, selectReading } from './cedict-html.js';

// Fragmentos reales de data/HSK_Level_{1,3}.txt, recortados a lo relevante.
const HUAN = `<div class="char">  <span id="char-sim-id">
<span class="text-color2">还</span> </span> <span class="sep">〔</span>
<span id="char-trad-id">  <span class="text-color2">還</span> </span>
<span class="sep">〕</span>
</div> <span class="pinYinWrapper">
<span class="text-color2">Huán</span>
</span> <ul>  <li>surname Huan</li> </ul>  <div class="char">  <span id="char-sim-id">
<span class="text-color2">还</span> </span> </div> <span class="pinYinWrapper">
<span class="text-color2">hái</span>
</span> <ul>  <li>still</li>  <li>still in progress</li>  <li>yet</li> </ul>  <div class="char">
</div> <span class="pinYinWrapper">
<span class="text-color2">huán</span>
</span> <ul>  <li>to pay back</li>  <li>to return</li> </ul>`;

const DI = `<div class="char">  <span id="char-sim-id">
<span class="text-color5">地</span> </span> </div> <span class="pinYinWrapper">
<span class="text-color5">de</span>
</span> <ul>  <li>-ly</li>  <li>structural particle: used before a verb or adjective</li> </ul>
<div class="char">  <span id="char-sim-id">
<span class="text-color4">地</span> </span> </div> <span class="pinYinWrapper">
<span class="text-color4">dì</span>
</span> <ul>  <li>earth</li>  <li>ground</li>  <li>field</li>  <li>CL:片[pian4]</li> </ul>`;

describe('parseDictionaryEntry', () => {
  it('devuelve un bloque por lectura, en orden', () => {
    const entry = parseDictionaryEntry(HUAN);

    expect(entry.readings.map((r) => r.reading)).toEqual(['Huán', 'hái', 'huán']);
  });

  it('extrae la forma tradicional', () => {
    expect(parseDictionaryEntry(HUAN).traditional).toBe('還');
    expect(parseDictionaryEntry(DI).traditional).toBeNull();
  });

  it('saca el clasificador de la lista de significados', () => {
    const di = parseDictionaryEntry(DI).readings.find((r) => r.reading === 'dì');

    expect(di.classifiers).toEqual(['片']);
    expect(di.meanings).toEqual(['earth', 'ground', 'field']);
  });
});

describe('selectReading', () => {
  it('elige el bloque cuya lectura coincide exactamente', () => {
    const entry = parseDictionaryEntry(HUAN);

    expect(selectReading(entry, 'hái').meanings).toEqual([
      'still',
      'still in progress',
      'yet',
    ]);
    expect(selectReading(entry, 'huán').meanings).toEqual(['to pay back', 'to return']);
  });

  it('prefiere la lectura común sobre la de apellido cuando solo difieren en mayúscula', () => {
    // "Huán" (apellido) y "huán" normalizan igual; gana la minúscula.
    const entry = parseDictionaryEntry(HUAN);

    expect(selectReading(entry, 'huan').meanings).toEqual(['to pay back', 'to return']);
  });

  it('tolera las diferencias de formato entre la columna de pinyin y el HTML', () => {
    const erhua = `<span class="pinYinWrapper"><span>nǎ r5</span></span> <ul> <li>where</li> </ul>`;

    expect(selectReading(parseDictionaryEntry(erhua), 'nǎr').meanings).toEqual(['where']);
  });

  it('prueba cada alternativa cuando la columna trae varias lecturas', () => {
    const shei = `<span class="pinYinWrapper"><span>shéi</span></span> <ul> <li>who</li> </ul>`;

    expect(selectReading(parseDictionaryEntry(shei), 'shéi/shuí').meanings).toEqual(['who']);
  });

  it('devuelve null cuando ninguna lectura coincide', () => {
    expect(selectReading(parseDictionaryEntry(DI), 'zzz')).toBeNull();
  });
});
