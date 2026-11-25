import { describe, expect, it } from 'vitest';
import { sourceHash, validateAudioManifest, type AudioManifest } from './manifest';

const sentences = {
  '00': { zh: '我在银行工作。', pinyin: 'Wǒ zài yínháng gōngzuò.' },
  '01': { zh: '我觉得很好。', pinyin: 'Wǒ juéde hěn hǎo.' },
};

const textByKey = { '00': sentences['00'].zh, '01': sentences['01'].zh };
const sourceHashByKey = {
  '00': sourceHash(sentences['00']),
  '01': sourceHash(sentences['01']),
};

function clip(key: string, overrides: Partial<AudioManifest['clips'][number]> = {}) {
  return {
    key,
    file: `${key}.m4a`,
    duration_ms: 1800,
    voice: 'zh-CN-XiaoxiaoNeural',
    source_hash: sourceHashByKey[key as '00' | '01'] ?? 'x',
    ...overrides,
  };
}

const manifest: AudioManifest = {
  kind: 'neural',
  owner: 'readings/banco',
  clips: [clip('00'), clip('01')],
  produced_by: 'edge-tts:zh-CN-XiaoxiaoNeural',
  license: 'provisional: edge-tts, no apto para publicar',
};

const opts = { expectedKeys: ['00', '01'], textByKey, sourceHashByKey };

describe('validateAudioManifest', () => {
  it('un manifiesto correcto no tiene problemas', () => {
    expect(validateAudioManifest(manifest, opts)).toEqual([]);
  });

  it('clip_missing: una clave esperada sin clip', () => {
    const issues = validateAudioManifest({ ...manifest, clips: [clip('00')] }, opts);

    expect(issues).toEqual([{ kind: 'clip_missing', key: '01' }]);
  });

  it('clip_orphan: un clip sin clave esperada', () => {
    const issues = validateAudioManifest({ ...manifest, clips: [...manifest.clips, clip('02')] }, opts);

    expect(issues).toEqual([{ kind: 'clip_orphan', key: '02' }]);
  });

  it('clip_stale: el texto o el pinyin cambiaron después de generar el clip', () => {
    const edited = { ...sourceHashByKey, '01': sourceHash({ zh: '我觉得很好。', pinyin: 'Wǒ jiàode hěn hǎo.' }) };

    expect(validateAudioManifest(manifest, { ...opts, sourceHashByKey: edited }))
      .toEqual([{ kind: 'clip_stale', key: '01' }]);
  });

  it('el hash de origen es el sha256 de zh + salto de línea + pinyin', () => {
    expect(sourceHash({ zh: '好。', pinyin: 'Hǎo.' })).toBe('a68b071252aad6c40b52ed23c481e17786f4f8ea3404d2445be952ed59dd7508');
    expect(sourceHash({ zh: '好。', pinyin: 'Hǎo.' })).not.toBe(sourceHash({ zh: '好。', pinyin: 'Hāo.' }));
  });

  it("kind_unknown: 'tts' no es un tipo de audio de fichero", () => {
    const issues = validateAudioManifest({ ...manifest, kind: 'tts' as never }, opts);

    expect(issues).toEqual([{ kind: 'kind_unknown' }]);
  });

  it('license_missing: sin licencia no se publica', () => {
    expect(validateAudioManifest({ ...manifest, license: ' ' }, opts)).toEqual([{ kind: 'license_missing' }]);
  });

  it('duration_implausible: 400 ms para una frase de 10 caracteres', () => {
    const ten = { ...textByKey, '00': '我今天和朋友去商店。' };
    const issues = validateAudioManifest(
      { ...manifest, clips: [clip('00', { duration_ms: 400 }), clip('01')] },
      { ...opts, textByKey: ten },
    );

    expect(issues).toEqual([{ kind: 'duration_implausible', key: '00' }]);
  });

  it('duration_implausible: un clip demasiado largo para su frase también', () => {
    // 6 caracteres: el máximo es 900 × 6 + 1500 = 6900 ms.
    const issues = validateAudioManifest(
      { ...manifest, clips: [clip('00'), clip('01', { duration_ms: 7000 })] },
      opts,
    );

    expect(issues).toEqual([{ kind: 'duration_implausible', key: '01' }]);
  });

  it('duplicate_key: dos clips con la misma clave', () => {
    const issues = validateAudioManifest({ ...manifest, clips: [...manifest.clips, clip('01')] }, opts);

    expect(issues).toEqual([{ kind: 'duplicate_key', key: '01' }]);
  });

  it('file_missing: el fichero del clip no está en disco', () => {
    const issues = validateAudioManifest(manifest, { ...opts, fileExists: file => file !== '01.m4a' });

    expect(issues).toEqual([{ kind: 'file_missing', key: '01' }]);
  });
});
