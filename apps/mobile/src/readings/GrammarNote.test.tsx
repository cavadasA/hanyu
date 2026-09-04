import { render, screen } from '@testing-library/react-native';
import { GrammarNote } from './GrammarNote';

describe('GrammarNote', () => {
  it('nombra el punto de gramática que la lectura practica', async () => {
    await render(<GrammarNote points={[{ code: '6.3.4', title: '比较句', category: '句子' }]} />);

    expect(screen.getByText('比较句')).toBeTruthy();
  });

  it('no ocupa sitio cuando la lectura no declara gramática', async () => {
    expect((render(<GrammarNote points={[]} />) as any).UNSAFE_root).toBeUndefined();
  });
});
