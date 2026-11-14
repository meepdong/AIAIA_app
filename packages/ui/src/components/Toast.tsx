import { useSyncExternalStore } from 'react';
import { Pressable, View } from 'react-native';
import { elevationStyle, minHit } from '../internal/interactive';
import { useTheme } from '../theme';
import { Text } from './Text';

export type ToastTone = 'neutral' | 'success' | 'warning' | 'danger';
export type ToastItem = { id: number; message: string; tone: ToastTone };

let items: readonly ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function emit(next: readonly ToastItem[]) {
  items = next;
  listeners.forEach((l) => l());
}

function dismiss(id: number) {
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.delete(id);
  emit(items.filter((t) => t.id !== id));
}

/**
 * Imperative helper: `toast.show('Saved')`. Needs one `<ToastHost />` mounted near the app root.
 * Never put phone numbers, dates of birth or amounts in a toast message.
 */
export const toast = {
  show(message: string, opts: { tone?: ToastTone; durationMs?: number } = {}): number {
    const id = nextId++;
    emit([...items.slice(-2), { id, message, tone: opts.tone ?? 'neutral' }]);
    timers.set(
      id,
      setTimeout(() => dismiss(id), opts.durationMs ?? 4000),
    );
    return id;
  },
  success: (message: string) => toast.show(message, { tone: 'success' }),
  error: (message: string) => toast.show(message, { tone: 'danger', durationMs: 6000 }),
  dismiss,
  /** For tests and sign-out. */
  clear() {
    timers.forEach((t) => clearTimeout(t));
    timers.clear();
    emit([]);
  },
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function ToastHost() {
  const { colors, tokens } = useTheme();
  const list = useSyncExternalStore(
    subscribe,
    () => items,
    () => items,
  );
  // The container is always mounted so screen readers register the live region before
  // the first toast arrives; only the items are conditional.
  // Toasts do not show above a native Modal (Sheet/ConfirmDialog): fire them after the modal closes.
  return (
    <View
      accessibilityLiveRegion="polite"
      aria-live="polite"
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: tokens.spacing[4],
        right: tokens.spacing[4],
        bottom: tokens.spacing[6],
        alignItems: 'center',
        gap: tokens.spacing[2],
      }}
    >
      {list.map((t) => {
        const accent = t.tone === 'neutral' ? colors.border : colors[t.tone];
        return (
          <Pressable
            key={t.id}
            accessibilityRole="alert"
            accessibilityLabel={t.message}
            accessibilityHint="Double tap to dismiss"
            onPress={() => dismiss(t.id)}
            style={[
              minHit,
              {
                maxWidth: 480,
                width: '100%',
                justifyContent: 'center',
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderLeftWidth: 4,
                borderColor: accent,
                borderRadius: tokens.radius.md,
                padding: tokens.spacing[3],
              },
              elevationStyle('md'),
            ]}
          >
            <Text>{t.message}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
