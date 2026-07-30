import { tokens } from './tokens';

function luminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(first: string, second: string) {
  const lighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

describe('theme tokens', () => {
  it.each(['light', 'dark'] as const)(
    'keeps accent text at AA contrast in the %s theme',
    (scheme) => {
      const colors = tokens.colors[scheme];

      expect(contrast(colors.vermilion, colors.onAccent)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.gold, colors.surface)).toBeGreaterThanOrEqual(4.5);
    },
  );
});
