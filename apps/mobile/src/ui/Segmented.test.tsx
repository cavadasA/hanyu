import { fireEvent, render, screen } from '@testing-library/react-native';
import { Segmented, type SegmentedOption } from './Segmented';

jest.mock('../theme/ThemeProvider', () => ({
  useTheme: () => ({
    colors: {
      bg: '#ffffff',
      surface: '#f9fafb',
      text: '#111827',
      textMuted: '#6b7280',
      border: '#e5e7eb',
      vermilion: '#c93624',
    },
  }),
}));

const OPTIONS: SegmentedOption<string>[] = [
  { value: 'learn', label: 'Learn' },
  { value: 'review', label: 'Review' },
  { value: 'exam', label: 'Exam' },
];

describe('Segmented', () => {
  it('renders all option labels and sets accessibility state', async () => {
    const onChange = jest.fn();
    await render(<Segmented options={OPTIONS} value="review" onChange={onChange} />);

    expect(screen.getByText('Learn')).toBeTruthy();
    expect(screen.getByText('Review')).toBeTruthy();
    expect(screen.getByText('Exam')).toBeTruthy();

    const reviewButton = screen.getByRole('button', { name: 'Review' });
    expect(reviewButton.props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true, disabled: false }),
    );

    const learnButton = screen.getByRole('button', { name: 'Learn' });
    expect(learnButton.props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false, disabled: false }),
    );
  });

  it('triggers onChange when another option is pressed', async () => {
    const onChange = jest.fn();
    await render(<Segmented options={OPTIONS} value="learn" onChange={onChange} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Exam' }));
    expect(onChange).toHaveBeenCalledWith('exam');
  });

  it('does not trigger onChange when disabled', async () => {
    const onChange = jest.fn();
    await render(<Segmented options={OPTIONS} value="learn" onChange={onChange} disabled />);

    await fireEvent.press(screen.getByRole('button', { name: 'Exam' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('mounts the indicator on layout measurement', async () => {
    const onChange = jest.fn();
    await render(<Segmented options={OPTIONS} value="review" onChange={onChange} />);

    const track = screen.getByTestId('segmented-track');
    await fireEvent(track, 'layout', {
      nativeEvent: { layout: { width: 300, height: 48, x: 0, y: 0 } },
    });

    expect(screen.getByTestId('segmented-indicator')).toBeTruthy();
  });
});
