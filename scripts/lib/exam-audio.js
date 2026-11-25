// Qué audio espera una forma del simulacro: un clip por entrada de la línea de tiempo de
// 听力 (instrucciones, ejemplos e ítems). Un clip de diálogo se compone de varios
// segmentos: cada línea con la voz de su speaker y silencios entre medias. El texto que
// se oye (zh y pinyin unidos por saltos de línea) da el source_hash del manifiesto.
import { sourceHash } from '../../packages/domain/src/media/manifest.ts';
import { itemClipKey, listeningClipKeys } from '../../packages/domain/src/exam/timeline.ts';

export const EXAM_VOICES = {
  F: 'zh-CN-XiaoxiaoNeural',
  M: 'zh-CN-YunxiNeural',
  /** Tercera voz, de locutor, para instrucciones y avisos. */
  instruction: 'zh-CN-YunyangNeural',
};

/** Silencio entre dos turnos de un diálogo. */
export const LINE_GAP_MS = 400;

export function examOwner(level, code) {
  return `exam/hsk${level}/${code}`;
}

function lines(audio) {
  return audio.flatMap((line, index) => [
    ...(index > 0 ? [{ silence_ms: LINE_GAP_MS }] : []),
    { zh: line.zh, pinyin: line.pinyin, voice: EXAM_VOICES[line.speaker] },
  ]);
}

const spoken = text => [{ zh: text.zh, pinyin: text.pinyin, voice: EXAM_VOICES.instruction }];

function questionGap(structure) {
  const part = structure.sections.find(section => section.code === 'listening').parts.find(entry => entry.code === '3');
  return part.question_gap_ms;
}

function stimulusOf(part, entry, structure) {
  if (part === 'L1') return lines(entry.audio);
  if (part === 'L2') return lines(entry.stimulus ?? entry.audio);
  return [...lines(entry.audio), { silence_ms: questionGap(structure) }, ...lines([entry.question])];
}

/** Segmentos de cada clip de la forma, en el orden de la línea de tiempo. */
export function examClipSpecs(form, instructions, structure) {
  const byKey = new Map([
    ['opening', spoken(instructions.opening)],
    ['closing', spoken(instructions.closing)],
  ]);
  for (const part of ['L1', 'L2', 'L3']) {
    byKey.set(`${part}-instruction`, spoken(instructions.parts[part].instruction));
    byKey.set(`${part}-start`, spoken(instructions.parts[part].start));
    const groups = form.groups.filter(group => group.part === part);
    const example = groups.find(group => group.example)?.example;
    if (example) byKey.set(`${part}-example`, stimulusOf(part, example, structure));
    groups.flatMap(group => group.items).forEach((item, index) => {
      byKey.set(itemClipKey(part, index), stimulusOf(part, item, structure));
    });
  }
  return listeningClipKeys(form.groups).map(key => ({ key, segments: byKey.get(key) }));
}

/** El texto que se oye en un clip, para el hash y para la duración plausible. */
export function clipSource(segments) {
  const said = segments.filter(segment => segment.zh !== undefined);
  return { zh: said.map(segment => segment.zh).join('\n'), pinyin: said.map(segment => segment.pinyin).join('\n') };
}

export function examAudioExpectations(form, instructions, structure) {
  const specs = examClipSpecs(form, instructions, structure);
  return {
    expectedKeys: specs.map(spec => spec.key),
    textByKey: Object.fromEntries(specs.map(spec => [spec.key, clipSource(spec.segments).zh])),
    sourceHashByKey: Object.fromEntries(specs.map(spec => [spec.key, sourceHash(clipSource(spec.segments))])),
  };
}
