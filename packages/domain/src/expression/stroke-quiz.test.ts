import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Point } from './recognize-handwriting';
import { quizHint, quizStroke, startWritingQuiz, strokeMatches, writingGrade } from './stroke-quiz';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const data = JSON.parse(
  readFileSync(resolve(root, 'apps/mobile/assets/hanzi-writer/writing-strokes.json'), 'utf8'),
) as Record<string, { medians: Point[][] }>;
const medians = (char: string) => data[char].medians;

/** Un trazo como lo dibuja un alumno sobre la cuadrícula: algo desplazado y con temblor. */
function drawn(stroke: Point[], { dx = 25, dy = -20, jitter = 15 } = {}): Point[] {
  let seed = 11;
  const noise = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return (seed / 233280 - 0.5) * 2 * jitter;
  };
  return stroke.map(([x, y]) => [x + dx + noise(), y + dy + noise()] as Point);
}

function write(char: string, order: number[]) {
  let state = startWritingQuiz(medians(char));
  const outcomes: string[] = [];
  for (const index of order) {
    const step = quizStroke(state, drawn(medians(char)[index]));
    state = step.state;
    outcomes.push(step.outcome);
  }
  return { state, outcomes };
}

describe('strokeMatches', () => {
  it('acepta el trazo esperado dibujado con temblor y algo desplazado', () => {
    expect(strokeMatches(drawn(medians('学')[0]), medians('学'), 0)).toBe(true);
  });

  it('rechaza un trazo dibujado en sentido contrario', () => {
    const reversed = [...drawn(medians('十')[0])].reverse();
    expect(strokeMatches(reversed, medians('十'), 0)).toBe(false);
  });

  it('rechaza un toque sin recorrido', () => {
    const [x, y] = medians('学')[0][0];
    expect(strokeMatches([[x, y], [x + 2, y + 1]], medians('学'), 0)).toBe(false);
  });

  it('rechaza un trazo que se parece más a uno posterior: el orden cuenta', () => {
    expect(strokeMatches(drawn(medians('三')[1]), medians('三'), 0)).toBe(false);
  });
});

describe('quiz de escritura', () => {
  it('学 en orden: ocho trazos aceptados, sin errores, Good', () => {
    const { state, outcomes } = write('学', [0, 1, 2, 3, 4, 5, 6, 7]);

    expect(outcomes.every(outcome => outcome === 'accepted')).toBe(true);
    expect(state.done).toBe(true);
    expect(state.mistakes).toBe(0);
    expect(writingGrade(state)).toBe('good');
  });

  it('un trazo fuera de orden se rechaza y cuenta un error: Hard', () => {
    const { state, outcomes } = write('学', [1, 0, 1, 2, 3, 4, 5, 6, 7]);

    expect(outcomes[0]).toBe('rejected');
    expect(state.done).toBe(true);
    expect(state.mistakes).toBe(1);
    expect(writingGrade(state)).toBe('hard');
  });

  it('no muestra nada hasta el tercer error en un trazo; entonces da la pista de ese trazo', () => {
    let state = startWritingQuiz(medians('学'));
    const wrong = drawn(medians('学')[5]);
    const hints: Array<number | null> = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const step = quizStroke(state, wrong);
      state = step.state;
      hints.push(step.hint);
    }

    expect(hints).toEqual([null, null, 0]);
    expect(state.hints).toBe(1);
    expect(writingGrade(state)).toBe('again');
  });

  it('pedir una pista es Again aunque no haya errores', () => {
    let state = startWritingQuiz(medians('学'));
    const step = quizHint(state);
    state = step.state;

    expect(step.hint).toBe(0);
    expect(writingGrade({ ...state, mistakes: 0 })).toBe('again');
  });

  it('un carácter de un solo trazo (一) no tiene orden que validar: vale la forma en cualquier sentido', () => {
    let state = startWritingQuiz(medians('一'));
    const step = quizStroke(state, [...drawn(medians('一')[0])].reverse());
    state = step.state;

    expect(step.outcome).toBe('accepted');
    expect(state.done).toBe(true);
    expect(writingGrade(state)).toBe('good');
  });

  it('1–2 errores son Hard; 3 o más, Again', () => {
    expect(writingGrade({ mistakes: 2, hints: 0 })).toBe('hard');
    expect(writingGrade({ mistakes: 3, hints: 0 })).toBe('again');
  });

  it('cada uno de los 250 caracteres de escritura, escrito en orden, sale sin errores', () => {
    const failures = Object.keys(data).filter(char => {
      const { state } = write(char, medians(char).map((_, index) => index));
      return !state.done || state.mistakes > 0;
    });

    expect(failures).toEqual([]);
  });

  it('terminado, ya no acepta más trazos', () => {
    const { state } = write('一', [0]);
    const step = quizStroke(state, drawn(medians('一')[0]));

    expect(step.outcome).toBe('ignored');
    expect(step.state).toBe(state);
  });
});
