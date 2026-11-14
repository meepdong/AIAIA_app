import {
  Platform,
  type PressableStateCallbackType,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { tokens, type ElevationKey } from '../tokens';

/** react-native-web adds hovered/focused to Pressable's state; native only has pressed. */
export type PressState = PressableStateCallbackType & { hovered?: boolean; focused?: boolean };

/** Visible keyboard focus ring (web; harmless on native). */
export function focusRing(color: string): ViewStyle {
  return { outlineWidth: 2, outlineColor: color, outlineOffset: 2, outlineStyle: 'solid' };
}

export function elevationStyle(level: ElevationKey): ViewStyle {
  const e = tokens.elevation[level];
  return Platform.OS === 'android' ? { elevation: e.android } : { boxShadow: e.boxShadow };
}

/** Keeps a small visual control a full 44 pt target. */
export const minHit: ViewStyle = {
  minWidth: tokens.minHitArea,
  minHeight: tokens.minHitArea,
};

/** Removes the browser outline on a text input whose wrapper draws the focus ring (web only). */
export const noOutline = { outlineStyle: 'none' } as unknown as TextStyle;
