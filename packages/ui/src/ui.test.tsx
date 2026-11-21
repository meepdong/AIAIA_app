import { act } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Dimensions, StyleSheet, Text as RNText } from 'react-native';
import { Header } from './components/Header';
import { Sheet } from './components/Sheet';
import { Button } from './components/Button';
import { IconButton } from './components/IconButton';
import { TextField } from './components/TextField';
import { Select } from './components/Select';
import { Tag } from './components/Tag';
import { Text } from './components/Text';
import { ConfirmDialog } from './components/ConfirmDialog';
import { QueryState, type QueryLike } from './components/QueryState';
import { toIsoDate } from './components/DateField';
import { toNationalNumber } from './components/PhoneField';
import { COLOR_ROLES, tokens } from './tokens';

describe('Button', () => {
  it('calls onPress when pressed', async () => {
    const onPress = jest.fn();
    await render(<Button title="Save" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', async () => {
    const onPress = jest.fn();
    await render(<Button title="Save" disabled onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('does not call onPress while loading and reports busy', async () => {
    const onPress = jest.fn();
    await render(<Button title="Save" loading onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Save' });
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(button.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  });
});

describe('QueryState', () => {
  const base: QueryLike<string[]> = { data: undefined, isPending: false, isError: false };
  const view = (query: QueryLike<string[]>) =>
    render(
      <QueryState query={query}>{(rows) => <RNText>{`rows:${rows.length}`}</RNText>}</QueryState>,
    );

  it('shows loading', async () => {
    await view({ ...base, isPending: true });
    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });

  it('shows error with a retry', async () => {
    const refetch = jest.fn();
    await view({ ...base, isError: true, refetch });
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('shows empty', async () => {
    await view({ ...base, data: [] });
    expect(screen.getByText('Nothing here yet')).toBeTruthy();
  });

  it('shows empty, not loading, for an idle query with no data', async () => {
    await view({ ...base, isPending: true, fetchStatus: 'idle' });
    expect(screen.queryByLabelText('Loading')).toBeNull();
    expect(screen.getByText('Nothing here yet')).toBeTruthy();
  });

  it('shows offline when the request is paused with nothing cached', async () => {
    await view({ ...base, isPending: true, fetchStatus: 'paused' });
    expect(screen.getByText('You are offline')).toBeTruthy();
  });

  it('renders children when data is present', async () => {
    await view({ ...base, data: ['a', 'b'] });
    expect(screen.getByText('rows:2')).toBeTruthy();
  });
});

describe('ConfirmDialog', () => {
  const dialog = async (loading?: boolean) => {
    const onCancel = jest.fn();
    await render(
      <ConfirmDialog
        visible
        title="Delete?"
        loading={loading}
        onConfirm={jest.fn()}
        onCancel={onCancel}
      />,
    );
    return onCancel;
  };

  it('exposes a single Cancel button to screen readers', async () => {
    await dialog();
    expect(screen.getAllByRole('button', { name: 'Cancel' })).toHaveLength(1);
  });

  it('ignores backdrop presses while loading', async () => {
    const onCancel = await dialog(true);
    await fireEvent.press(screen.getByTestId('confirm-backdrop', { includeHiddenElements: true }));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('cancels on backdrop press when idle', async () => {
    const onCancel = await dialog(false);
    await fireEvent.press(screen.getByTestId('confirm-backdrop', { includeHiddenElements: true }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('field helpers', () => {
  it('normalises pasted phone numbers to 10 digits', async () => {
    expect(toNationalNumber('+91 90000 00001')).toBe('9000000001');
    expect(toNationalNumber('090000 00001')).toBe('9000000001');
    expect(toNationalNumber('9000000001')).toBe('9000000001');
  });

  it('accepts only real calendar dates', async () => {
    expect(toIsoDate('29', '02', '2024')).toBe('2024-02-29');
    expect(toIsoDate('31', '02', '2024')).toBe('');
    expect(toIsoDate('1', '1', '20')).toBe('');
  });
});

describe('tokens', () => {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
      number,
      number,
      number,
    ];
    const f = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
    return (hi + 0.05) / (lo + 0.05);
  };

  it('defines every role in both themes', async () => {
    for (const scheme of ['light', 'dark'] as const) {
      for (const role of COLOR_ROLES)
        expect(tokens.colors[scheme][role]).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it.each(['light', 'dark'] as const)('%s theme meets WCAG AA for text and controls', (scheme) => {
    const c = tokens.colors[scheme];
    for (const bg of [c.surface, c.surfaceAlt]) {
      expect(contrast(c.text, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.textMuted, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.border, bg)).toBeGreaterThanOrEqual(3);
    }
    expect(contrast(c.onPrimary, c.primary)).toBeGreaterThanOrEqual(4.5);
    for (const tone of [c.success, c.warning, c.danger]) {
      expect(contrast(tone, c.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.onPrimary, tone)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(['light', 'dark'] as const)('%s theme muted pairs and info meet AA', (scheme) => {
    const c = tokens.colors[scheme];
    const pairs = [
      ['onInfoMuted', c.onInfoMuted, c.infoMuted],
      ['onSuccessMuted', c.onSuccessMuted, c.successMuted],
      ['onWarningMuted', c.onWarningMuted, c.warningMuted],
      ['onDangerMuted', c.onDangerMuted, c.dangerMuted],
    ] as const;
    for (const [name, fg, bg] of pairs) {
      expect([name, contrast(fg, bg) >= 4.5]).toEqual([name, true]);
    }
    expect(contrast(c.info, c.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.onPrimary, c.info)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.border, c.background)).toBeGreaterThanOrEqual(3);
    expect(contrast(c.focus, c.surface)).toBeGreaterThanOrEqual(3);
  });

  it.each(['light', 'dark'] as const)('%s theme layers are distinct', (scheme) => {
    const c = tokens.colors[scheme];
    expect(c.divider.toLowerCase()).not.toBe(c.surface.toLowerCase());
    expect(c.background.toLowerCase()).not.toBe(c.surface.toLowerCase());
    expect(c.neutral.toLowerCase()).not.toBe(c.surface.toLowerCase());
  });

  it('carries the Astryx radius, motion and per-scheme shadow tokens', () => {
    expect(tokens.radius).toMatchObject({ sm: 6, md: 10, lg: 12, xl: 28, full: 9999 });
    expect(tokens.motion).toMatchObject({ fast: 125, medium: 300, slow: 700 });
    expect(tokens.motion.easeStandard).toEqual([0.24, 1, 0.4, 1]);
    for (const key of ['sm', 'md', 'lg'] as const) {
      expect(tokens.elevation[key].boxShadowDark).toContain('inset');
      expect(tokens.elevation[key].boxShadow).not.toContain('inset');
    }
  });

  it('Text uses the Figtree face for its weight', async () => {
    await render(
      <>
        <Text>plain body</Text>
        <Text variant="heading">a heading</Text>
        <Text bold>bold body</Text>
      </>,
    );
    const family = (label: string) => StyleSheet.flatten(screen.getByText(label).props.style);
    expect(family('plain body')).toMatchObject({
      fontFamily: 'Figtree_400Regular',
      fontWeight: '400',
    });
    expect(family('a heading')).toMatchObject({
      fontFamily: 'Figtree_600SemiBold',
      fontWeight: '600',
    });
    expect(family('bold body')).toMatchObject({ fontFamily: 'Figtree_600SemiBold' });
  });
});

describe('Header', () => {
  const original = Dimensions.get('window');
  afterEach(async () => {
    await act(async () => Dimensions.set({ window: original }));
  });

  it('keeps the title to one line at the normal font scale', async () => {
    await render(<Header title="A long page title" />);
    await act(async () => Dimensions.set({ window: { ...original, fontScale: 1 } }));
    expect(screen.getByText('A long page title').props.numberOfLines).toBe(1);
  });

  it('allows two title lines at large font scales', async () => {
    await render(<Header title="A long page title" />);
    await act(async () => Dimensions.set({ window: { ...original, fontScale: 2 } }));
    expect(screen.getByText('A long page title').props.numberOfLines).toBe(2);
  });
});

describe('Sheet', () => {
  it('pads the content by the bottom safe-area inset', async () => {
    await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 360, height: 640 },
          insets: { top: 0, left: 0, right: 0, bottom: 34 },
        }}
      >
        <Sheet visible onClose={() => {}} title="Pick one">
          <RNText>body</RNText>
        </Sheet>
      </SafeAreaProvider>,
    );
    let panel = screen.getByText('Pick one').parent;
    while (panel && !panel.props.accessibilityViewIsModal) panel = panel.parent;
    const flat = StyleSheet.flatten(panel?.props.style);
    expect(flat.paddingBottom).toBe(tokens.spacing[4] + 34);
  });
});

describe('Astryx controls', () => {
  const flat = (node: { props: { style?: unknown } }) =>
    StyleSheet.flatten(node.props.style as never) as Record<string, unknown>;
  /** The nearest ancestor (or the node itself) whose style draws a border. */
  const boxOf = (node: { props: { style?: unknown }; parent: unknown }) => {
    let cur = node as { props: { style?: unknown }; parent: unknown } | null;
    while (cur && flat(cur).borderWidth === undefined) {
      cur = cur.parent as typeof cur;
    }
    return flat(cur as never);
  };
  const light = tokens.colors.light;

  it('draws the secondary button as a borderless translucent fill', async () => {
    await render(<Button title="Cancel" variant="secondary" />);
    const style = flat(screen.getByRole('button', { name: 'Cancel' }));
    expect(style.borderWidth ?? 0).toBe(0);
    expect(style.backgroundColor).toBe(tokens.overlays.light.fill);
  });

  it('uses the control border at rest and the danger colour on error', async () => {
    await render(
      <>
        <TextField label="Name" />
        <TextField label="Email" error="Enter a valid email" />
      </>,
    );
    expect(boxOf(screen.getByLabelText('Name')).borderColor).toBe(light.border);
    expect(boxOf(screen.getByLabelText('Email')).borderColor).toBe(light.danger);
  });

  it('keeps a 44 pt target on every pressable control', async () => {
    await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 360, height: 640 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <Button title="Save" />
        <IconButton accessibilityLabel="Add" icon={<RNText>+</RNText>} />
        <TextField label="Name" />
        <Select
          label="Role"
          options={[{ label: 'Youth', value: 'youth' }]}
          value={null}
          onChange={() => {}}
        />
        <Tag label="Youth" onPress={() => {}} />
      </SafeAreaProvider>,
    );
    const min = (n: { props: { style?: unknown } }) => flat(n).minHeight as number;
    expect(min(screen.getByRole('button', { name: 'Save' }))).toBeGreaterThanOrEqual(44);
    expect(min(screen.getByRole('button', { name: 'Add' }))).toBeGreaterThanOrEqual(44);
    expect(boxOf(screen.getByLabelText('Name')).minHeight).toBeGreaterThanOrEqual(44);
    expect(min(screen.getByRole('button', { name: 'Role, Select' }))).toBeGreaterThanOrEqual(44);
    expect(min(screen.getByRole('button', { name: 'Youth' }))).toBeGreaterThanOrEqual(44);
  });

  it('renders the label variant in Figtree medium', async () => {
    await render(<Text variant="label">A label</Text>);
    expect(flat(screen.getByText('A label'))).toMatchObject({
      fontFamily: 'Figtree_500Medium',
      fontWeight: '500',
    });
  });
});
