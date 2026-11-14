import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { focusRing, minHit, type PressState } from '../internal/interactive';
import { useTheme } from '../theme';
import { Header } from './Header';
import { IconButton } from './IconButton';
import { Text } from './Text';

export type AdminNavItem = { key: string; label: string };

export type AdminLayoutProps = {
  title: string;
  nav: readonly AdminNavItem[];
  activeKey: string;
  onNavigate: (key: string) => void;
  headerRight?: ReactNode;
  children: ReactNode;
  /** Width at which the sidebar replaces the drawer. */
  breakpoint?: number;
};

/** Desktop: sidebar + content. Narrow: header with a menu button that opens a drawer. */
export function AdminLayout({
  title,
  nav,
  activeKey,
  onNavigate,
  headerRight,
  children,
  breakpoint = 1024,
}: AdminLayoutProps) {
  const { colors, tokens } = useTheme();
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const wide = width >= breakpoint;

  const navList = (
    <View role="navigation" style={{ gap: tokens.spacing[1], padding: tokens.spacing[3] }}>
      {nav.map((item) => {
        const active = item.key === activeKey;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="link"
            accessibilityState={{ selected: active }}
            onPress={() => {
              setOpen(false);
              onNavigate(item.key);
            }}
            style={(s: PressState) => [
              minHit,
              {
                justifyContent: 'center',
                paddingHorizontal: tokens.spacing[3],
                borderRadius: tokens.radius.md,
                backgroundColor: active
                  ? colors.primary
                  : s.hovered
                    ? colors.surfaceAlt
                    : 'transparent',
              },
              s.focused && focusRing(colors.text),
            ]}
          >
            <Text bold={active} style={{ color: active ? colors.onPrimary : colors.text }}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  if (wide) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.surface }}>
        <View style={{ width: 260, borderRightWidth: 1, borderRightColor: colors.surfaceAlt }}>
          <View style={{ padding: tokens.spacing[4] }}>
            <Text variant="heading">{title}</Text>
          </View>
          {navList}
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: tokens.spacing[6] }}>
          {children}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <Header
        title={title}
        right={
          <>
            {headerRight}
            <IconButton
              accessibilityLabel="Open menu"
              onPress={() => setOpen(true)}
              icon={<Text variant="heading">{'☰'}</Text>}
            />
          </>
        }
      />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: tokens.spacing[4] }}>
        {children}
      </ScrollView>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <View
            accessibilityViewIsModal
            style={{ width: 280, maxWidth: '85%', backgroundColor: colors.surface }}
          >
            {navList}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close menu"
            onPress={() => setOpen(false)}
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}
          />
        </View>
      </Modal>
    </View>
  );
}
