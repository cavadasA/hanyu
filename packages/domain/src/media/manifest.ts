// Manifiesto de audio: qué clip corresponde a qué texto, quién lo produjo y con
// qué licencia. Es común a las lecturas (un clip por frase) y al simulacro del
// Plan 12. La regla de fondo: un clip nunca suena para un texto que no es el
// suyo. Si el texto cambia, el hash de origen deja de casar y la build falla.
import { sha256Hex } from './sha256.ts';

export type AudioKind = 'neural' | 'human';

export interface AudioClip {
  key: string;
  /** Ruta relativa al directorio del manifiesto. */
  file: string;
  duration_ms: number;
  voice: string;
  /** sha256 de `zh + '\n' + pinyin` del texto con el que se generó el clip. */
  source_hash: string;
}

export interface AudioManifest {
  kind: AudioKind;
  owner: string;
  clips: AudioClip[];
  produced_by: string;
  license: string;
  /** Audio que no puede publicarse tal cual (p. ej. generado con edge-tts). */
  provisional?: boolean;
}

export type MediaIssueKind =
  | 'file_missing'
  | 'duration_implausible'
  | 'kind_unknown'
  | 'license_missing'
  | 'duplicate_key';

export type ManifestIssueKind = MediaIssueKind | 'clip_missing' | 'clip_orphan' | 'clip_stale';

export interface ManifestIssue {
  kind: ManifestIssueKind;
  key?: string;
}

export interface ManifestExpectations {
  expectedKeys: string[];
  /** Texto que se oye en cada clip; sólo cuentan sus caracteres hanzi. */
  textByKey: Record<string, string>;
  sourceHashByKey: Record<string, string>;
  fileExists?: (file: string) => boolean;
}

const KINDS: AudioKind[] = ['neural', 'human'];

export function sourceHash(text: { zh: string; pinyin: string }): string {
  return sha256Hex(`${text.zh}\n${text.pinyin}`);
}

export function hanziCount(text: string): number {
  return [...text].filter(character => /\p{Script=Han}/u.test(character)).length;
}

/**
 * Duración plausible, determinista: entre 180 ms y 900 ms por carácter, más
 * 1,5 s de margen para silencios. Fuera de ahí el clip es mudo, está truncado
 * o es de otra frase.
 */
export function durationIsPlausible(durationMs: number, text: string): boolean {
  const characters = hanziCount(text);
  return durationMs >= 180 * characters && durationMs <= 900 * characters + 1500;
}

export function validateAudioManifest(
  manifest: AudioManifest,
  opts: ManifestExpectations,
): ManifestIssue[] {
  const issues: ManifestIssue[] = [];

  if (!KINDS.includes(manifest.kind)) {
    issues.push({ kind: 'kind_unknown' });
  }
  if (!manifest.license?.trim()) {
    issues.push({ kind: 'license_missing' });
  }

  const expected = new Set(opts.expectedKeys);
  const seen = new Set<string>();

  for (const clip of manifest.clips) {
    if (seen.has(clip.key)) {
      issues.push({ kind: 'duplicate_key', key: clip.key });
      continue;
    }
    seen.add(clip.key);

    if (!expected.has(clip.key)) {
      issues.push({ kind: 'clip_orphan', key: clip.key });
      continue;
    }
    if (opts.fileExists && !opts.fileExists(clip.file)) {
      issues.push({ kind: 'file_missing', key: clip.key });
      continue;
    }
    if (clip.source_hash !== opts.sourceHashByKey[clip.key]) {
      issues.push({ kind: 'clip_stale', key: clip.key });
      continue;
    }
    if (!durationIsPlausible(clip.duration_ms, opts.textByKey[clip.key] ?? '')) {
      issues.push({ kind: 'duration_implausible', key: clip.key });
    }
  }

  for (const key of opts.expectedKeys) {
    if (!seen.has(key)) {
      issues.push({ kind: 'clip_missing', key });
    }
  }

  return issues;
}

// Manifiesto de imágenes (Plan 12): cada imagen del simulacro declara qué muestra, de
// dónde sale y con qué licencia. Sin licencia no entra.

export interface ImageManifest {
  owner: string;
  images: Array<{ key: string; file: string; depicts_es: string; source: string; license: string }>;
}

export type ImageIssueKind =
  | 'license_missing'
  | 'source_missing'
  | 'depicts_missing'
  | 'image_format'
  | 'image_too_large'
  | 'file_missing'
  | 'duplicate_key';

export interface ImageIssue {
  kind: ImageIssueKind;
  key: string;
}

/** 800 px de lado mayor en .webp caben de sobra en 80 KB. */
export const IMAGE_MAX_BYTES = 80 * 1024;

export function validateImageManifest(
  manifest: ImageManifest,
  opts: { fileSize: (file: string) => number | null },
): ImageIssue[] {
  const issues: ImageIssue[] = [];
  const seen = new Set<string>();

  for (const image of manifest.images) {
    const report = (kind: ImageIssueKind) => issues.push({ kind, key: image.key });
    if (seen.has(image.key)) {
      report('duplicate_key');
      continue;
    }
    seen.add(image.key);

    if (!image.license?.trim()) report('license_missing');
    if (!image.source?.trim()) report('source_missing');
    if (!image.depicts_es?.trim()) report('depicts_missing');
    if (!image.file.endsWith('.webp')) report('image_format');

    const size = opts.fileSize(image.file);
    if (size === null) report('file_missing');
    else if (size > IMAGE_MAX_BYTES) report('image_too_large');
  }

  return issues;
}
