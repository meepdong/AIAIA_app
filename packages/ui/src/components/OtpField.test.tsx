import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { OtpField } from './OtpField';

function Harness({ onComplete }: { onComplete?: (c: string) => void }) {
  const [code, setCode] = useState('');
  return <OtpField value={code} onChangeText={setCode} onComplete={onComplete} />;
}

describe('OtpField', () => {
  it('fills all six boxes when six digits are pasted', async () => {
    const onComplete = jest.fn();
    await render(<Harness onComplete={onComplete} />);
    await fireEvent.changeText(screen.getByTestId('otp-input'), '123456');
    for (let i = 0; i < 6; i++) {
      expect(screen.getByTestId(`otp-box-${i}`, { includeHiddenElements: true })).toHaveTextContent(
        String(i + 1),
      );
    }
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('strips spaces and letters from a pasted code', async () => {
    await render(<Harness />);
    await fireEvent.changeText(screen.getByTestId('otp-input'), 'G-123 456');
    expect(screen.getByTestId('otp-input').props.value).toBe('123456');
  });
});
