import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from './sha256';

describe('sha256Hex', () => {
  it.each([
    '',
    'abc',
    '我在银行工作。\nWǒ zài yínháng gōngzuò.',
    '长'.repeat(200),
    'x'.repeat(55),
    'x'.repeat(56),
    'x'.repeat(64),
    '😀 emoji fuera del plano básico',
  ])('coincide con node:crypto para %j', text => {
    expect(sha256Hex(text)).toBe(createHash('sha256').update(text, 'utf8').digest('hex'));
  });
});
