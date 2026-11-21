import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// In this expo-router version a Tabs screen hidden with `href: null` cannot be navigated to: a tap
// or a deep link to it falls back to the index route, which redirects to /home (found in the
// browser on 2026-11-21: event detail and My family both bounced to /home). Pages that live under
// the tab bar without their own tab hide only the tab button: `tabBarButton: () => null`. That
// alone still leaves an empty slot in the bar (found in the browser after the P1-07b merge: six
// blank 80 px slots), so the item is also taken out of the layout with `display: 'none'`.
const LAYOUT = join(__dirname, '../../app/(app)/_layout.tsx');

describe('member tab layout', () => {
  const source = readFileSync(LAYOUT, 'utf8');

  it('never hides a screen with href: null', () => {
    expect(source).not.toMatch(/href:\s*null/);
  });

  it('the shared hidden options drop the button and its slot', () => {
    const hidden = source.match(/const HIDDEN = (\{[^\n]*\})/)?.[1];
    expect(hidden).toBeDefined();
    expect(hidden).toMatch(/tabBarButton:\s*\(\)\s*=>\s*null/);
    expect(hidden).toMatch(/tabBarItemStyle:\s*\{\s*display:\s*'none'\s*\}/);
  });

  it.each([
    'events/[id]',
    'events/duties',
    'profile/family',
    '_dev/ui-gallery',
    'pass/index',
    'checkin/[id]',
  ])('keeps %s reachable but out of the tab bar', (name) => {
    const line = source.split('\n').find((l) => l.includes(`name="${name}"`));
    expect(line).toBeDefined();
    expect(line).toMatch(/options=\{HIDDEN\}/);
  });
});
