// Construye las formas del simulacro (Plan 12) y emite server/db/seeds/exam-forms.json,
// que build-supabase-seed vuelca en la tabla exam_form. Por cada forma:
//   - valida sus grupos con validateExamForm (estructura, vocabulario, bancos, 书写);
//   - valida el manifiesto de sus imágenes (content/images/exam/hsk<n>/<forma>/);
//   - exige su audio en media-index.json y construye la línea de tiempo de 听力;
//   - dibuja los caracteres incompletos de 书写 1.
// Entre formas, ninguna pregunta puede repetirse. Con cualquier issue, la build falla:
// una parte sin contenido no se sirve a medias.
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateExamForm } from '../packages/domain/src/exam/validate.ts';
import { buildListeningTimeline } from '../packages/domain/src/exam/timeline.ts';
import { incompleteCharacterSvg } from '../packages/domain/src/exam/components.ts';
import { validateImageManifest } from '../packages/domain/src/media/manifest.ts';
import { loadDictionary } from './build-readings.js';
import { examAudioExpectations, examOwner } from './lib/exam-audio.js';
import { examDir as defaultExamDir, listExamForms, loadExamForm, loadExamInstructions, loadExamStructure, seedDir } from './lib/exam.js';
import { fileSha256, storagePathFor } from './lib/media.js';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
export const defaultImagesDir = join(rootDir, 'content', 'images');
export const defaultOutFile = join(seedDir, 'exam-forms.json');

const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const joinZh = lines => lines.map(line => line.zh).join('/');

/** Una firma por pregunta: lo que se oye o se lee, sin las opciones. */
export function questionSignatures(group) {
  return group.items.map(item => {
    switch (group.part) {
      case 'L1': return `L1|${joinZh(item.audio)}`;
      case 'L2': return `L2|${joinZh(item.audio)}`;
      case 'R1': return `R1|${item.text.zh}`;
      case 'L3': return `L3|${joinZh([...item.audio, item.question])}`;
      case 'R2':
      case 'R3': return `${group.part}|${item.text.zh}`;
      case 'R4': return `R4|${item.passage.zh}/${item.question.zh}`;
      case 'W1': return `W1|${item.word.zh}#${item.target_index}`;
      case 'W2': return `W2|${item.sentence.zh}`;
      default: throw new Error(`Parte desconocida: ${group.part}`);
    }
  });
}

/** SVG del carácter incompleto de cada pregunta de 书写 1 (y de su ejemplo): `<slug>:<índice>`. */
export function characterImages(form, decomposition) {
  const images = {};
  for (const group of form.groups.filter(entry => entry.part === 'W1')) {
    const entries = [
      ...(group.example ? [['example', group.example]] : []),
      ...group.items.map((item, index) => [String(index), item]),
    ];
    for (const [id, entry] of entries) {
      const target = Array.from(entry.word.zh)[entry.target_index];
      const data = decomposition[target];
      if (!data) throw new Error(`${group.slug}: sin datos de trazos para ${target}`);
      images[`${group.slug}:${id}`] = incompleteCharacterSvg(target, group.bank[entry.answer], data.strokes, data);
    }
  }
  return images;
}

function loadImageManifest(imagesDir, owner) {
  const dir = join(imagesDir, owner);
  const path = join(dir, 'manifest.json');
  return existsSync(path) ? { dir, manifest: readJson(path) } : { dir, manifest: { owner, images: [] } };
}

function loadHandwriting() {
  return new Set(
    readJson(join(seedDir, 'hsk-characters.json'))
      .filter(entry => entry.handwriting && entry.hsk_level <= 2)
      .map(entry => entry.hanzi),
  );
}

function loadMediaIndex() {
  const path = join(seedDir, 'media-index.json');
  return existsSync(path) ? readJson(path) : {};
}

export async function buildExam({
  level = 2,
  examDir = defaultExamDir,
  imagesDir = defaultImagesDir,
  mediaIndex = loadMediaIndex(),
  structure = loadExamStructure(),
  dictionary = loadDictionary(),
  handwriting = loadHandwriting(),
  decomposition = readJson(join(seedDir, 'hanzi-decomposition.json')),
} = {}) {
  const forms = [];
  const issues = [];
  const seen = new Map();

  for (const code of listExamForms(level, examDir)) {
    const report = issue => issues.push({ form: code, ...issue });
    const form = loadExamForm(level, code, examDir);
    const owner = examOwner(level, code);

    const { dir, manifest } = loadImageManifest(imagesDir, owner);
    const fileSize = file => (existsSync(join(dir, file)) ? statSync(join(dir, file)).size : null);
    validateImageManifest(manifest, { fileSize }).forEach(report);

    validateExamForm(form, {
      dictionary,
      handwriting,
      decomposition,
      structure,
      images: new Set(manifest.images.map(image => image.key)),
    }).forEach(report);

    for (const group of form.groups) {
      questionSignatures(group).forEach((signature, question_index) => {
        const first = seen.get(signature);
        if (first) report({ kind: 'question_repeated', group: group.slug, question_index, detail: first });
        else seen.set(signature, `${code}:${group.slug}`);
      });
    }

    const audio = mediaIndex[owner];
    const expected = examAudioExpectations(form, loadExamInstructions(level, examDir), structure).expectedKeys;
    const missing = expected.filter(key => !audio?.[key]);
    if (missing.length > 0) {
      report({ kind: 'audio_missing', detail: `${missing.length} clips de ${owner}` });
      continue;
    }

    let timeline;
    try {
      timeline = buildListeningTimeline(
        form.groups,
        structure,
        Object.fromEntries(expected.map(key => [key, audio[key].duration_ms])),
      );
    } catch (error) {
      report({ kind: 'timeline_invalid', detail: error.message });
      continue;
    }

    const images = Object.fromEntries(manifest.images
      .filter(image => fileSize(image.file) !== null)
      .map(image => [image.key, { path: storagePathFor(fileSha256(join(dir, image.file)), image.file) }]));

    forms.push({
      level,
      code,
      content: form,
      timeline,
      media: {
        audio: Object.fromEntries(expected.map(key => [key, audio[key]])),
        images,
        characters: characterImages(form, decomposition),
      },
    });
  }

  return { forms, issues };
}

if (process.argv[1] && process.argv[1].endsWith('build-exam.js')) {
  const { forms, issues } = await buildExam();
  for (const issue of issues) {
    const where = [issue.form, issue.group, issue.question_index].filter(part => part !== undefined).join(' ');
    console.error(`${where}: ${issue.kind}${issue.key ? ` (${issue.key})` : ''}${issue.detail ? ` — ${issue.detail}` : ''}`);
  }
  if (issues.length > 0) {
    console.error(`\n${issues.length} problemas en el simulacro`);
    process.exit(1);
  }
  writeFileSync(defaultOutFile, `${JSON.stringify(forms)}\n`);
  console.log(`${forms.length} formas → ${defaultOutFile}`);
}
