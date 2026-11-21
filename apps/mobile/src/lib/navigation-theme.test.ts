import { tokens } from '@aiaia/ui';
import { navigationTheme } from './navigation-theme';

describe('navigationTheme', () => {
  it.each(['light', 'dark'] as const)('maps the %s tokens', (scheme) => {
    const c = tokens.colors[scheme];
    const t = navigationTheme(scheme, c);
    expect(t.dark).toBe(scheme === 'dark');
    expect(t.colors).toMatchObject({
      background: c.background,
      card: c.surface,
      text: c.text,
      border: c.divider,
      primary: c.primary,
      notification: c.danger,
    });
    expect(t.fonts).toBeDefined();
  });

  it('differs between the schemes', () => {
    const l = navigationTheme('light', tokens.colors.light);
    const d = navigationTheme('dark', tokens.colors.dark);
    expect(l.colors.background).not.toBe(d.colors.background);
  });
});
