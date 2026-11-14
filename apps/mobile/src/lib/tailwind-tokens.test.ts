// The Tailwind theme must be built from the shared design tokens, so a token edit cannot drift
// from the class names screens use (bg-primary, dark:text-textMuted-dark, ...).
const tailwindConfig = jest.requireActual<{
  theme: { extend: { colors: Record<string, string> } };
}>('../../tailwind.config.js');
const uiTokens = jest.requireActual<{
  colors: { light: Record<string, string>; dark: Record<string, string> };
}>('../../../../packages/ui/src/tokens.json');

describe('tailwind theme tokens', () => {
  const colors = tailwindConfig.theme.extend.colors;

  it('has a light key for every colour token with the same value', () => {
    const roles = Object.keys(uiTokens.colors.light);
    expect(roles.length).toBeGreaterThan(0);
    for (const role of roles) {
      expect(colors[role]).toBe(uiTokens.colors.light[role]);
    }
  });

  it('has a -dark key for every colour token with the dark value', () => {
    for (const [role, value] of Object.entries(uiTokens.colors.dark)) {
      expect(colors[`${role}-dark`]).toBe(value);
    }
  });

  it('has no colour keys beyond the tokens', () => {
    const expected = Object.keys(uiTokens.colors.light).flatMap((r) => [r, `${r}-dark`]);
    expect(Object.keys(colors).sort()).toEqual(expected.sort());
  });
});
