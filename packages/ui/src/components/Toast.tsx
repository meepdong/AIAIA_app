import { useSyncExternalStore } from 'react';
import { Pressable, View } from 'react-native';
import {
  elevationStyle,
  focusRing,
  minHit,
  onPrimaryOverlays,
  stateOverlay,
  type PressState,
} from '../internal/interactive';
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
  const { colors, overlays, scheme, tokens } = useTheme();
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
        // Muted fill pairs like the Astryx Banner; a neutral toast is the inverse (primary) pair.
        const pair = {
          neutral: { bg: colors.primary, fg: colors.onPrimary },
          success: { bg: colors.successMuted, fg: colors.onSuccessMuted },
          warning: { bg: colors.warningMuted, fg: colors.onWarningMuted },
          danger: { bg: colors.dangerMuted, fg: colors.onDangerMuted },
        }[t.tone];
        return (
          <Pressable
            key={t.id}
            accessibilityRole="alert"
            accessibilityLabel={t.message}
            accessibilityHint="Double tap to dismiss"
            onPress={() => dismiss(t.id)}
            style={(s: PressState) => [
              minHit,
              {
                maxWidth: 480,
                width: '100%',
                justifyContent: 'center',
                backgroundColor: pair.bg,
                borderRadius: tokens.radius.lg,
                paddingVertical: tokens.spacing[3],
                paddingHorizontal: tokens.spacing[4],
              },
              elevationStyle('md', scheme),
              s.focused && focusRing(colors.focus),
            ]}
          >
            {(s: PressState) => (
              <>
                {stateOverlay(
                  s,
                  t.tone === 'neutral' ? onPrimaryOverlays(scheme) : overlays,
                  tokens.radius.lg,
                )}
                <Text variant="label" style={{ color: pair.fg }}>
                  {t.message}
                </Text>
              </>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
