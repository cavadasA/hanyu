import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultExpectationsFor } from './media-owners.js';

const p = zh => ({ zh, pinyin: 'pīnyīn' });
let examDir;
beforeEach(() => {
  examDir = mkdtempSync(join(tmpdir(), 'hanyu-exam-owner-'));
  mkdirSync(join(examDir, 'hsk2', 'A'), { recursive: true });
  writeFileSync(join(examDir, 'hsk2', 'instructions.json'), JSON.stringify({
    opening: p('开始'),
    closing: p('结束'),
    parts: Object.fromEntries(['L1', 'L2', 'L3'].map(part => [part, { instruction: p('部分'), start: p('开始') }])),
  }));
  writeFileSync(join(examDir, 'hsk2', 'A', 'L1-01.json'), JSON.stringify({
    slug: 'a-l1', part: 'L1', items: [{ audio: [{ ...p('我喝茶'), speaker: 'F' }], images: ['a', 'b', 'c'], answer: 0 }],
  }));
});
afterEach(() => rmSync(examDir, { recursive: true, force: true }));

describe('dueños de audio del simulacro', () => {
  it('exam/hsk2/<forma> espera los clips de la línea de tiempo de esa forma', () => {
    const expectations = defaultExpectationsFor({ examDir })('exam/hsk2/A');
    expect(expectations.expectedKeys).toContain('L1-q01');
    expect(expectations.expectedKeys[0]).toBe('opening');
  });

  it('una forma que no existe no tiene dueño', () => {
    expect(defaultExpectationsFor({ examDir })('exam/hsk2/Z')).toBeNull();
  });
});
