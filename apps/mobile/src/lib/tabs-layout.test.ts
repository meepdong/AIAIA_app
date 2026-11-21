import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// In this expo-router version a Tabs screen hidden with `href: null` cannot be navigated to: a tap
// or a deep link to it falls back to the index route, which redirects to /home (found in the
// browser on 2026-11-21: event detail and My family both bounced to /home). Pages that live under
// the tab bar without their own tab hide only the tab button: `tabBarButton: () => null`.
const LAYOUT = join(__dirname, '../../app/(app)/_layout.tsx');

describe('member tab layout', () => {
  const source = readFileSync(LAYOUT, 'utf8');

  it('never hides a screen with href: null', () => {
    expect(source).not.toMatch(/href:\s*null/);
  });

  it.each(['events/[id]', 'events/duties', 'profile/family'])(
    'keeps %s reachable but out of the tab bar',
    (name) => {
      const line = source.split('\n').find((l) => l.includes(`name="${name}"`));
      expect(line).toBeDefined();
      expect(line).toMatch(/tabBarButton:\s*\(\)\s*=>\s*null/);
    },
  );
});
