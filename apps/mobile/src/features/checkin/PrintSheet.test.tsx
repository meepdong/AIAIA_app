import { PassError, type Api, type BulkPass } from '@aiaia/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { ApiProvider } from '@/features/auth/useApi';
import { PrintSheetScreen } from './PrintSheetScreen';
import { chunkPages, PASSES_PER_PAGE, printSheet, sheetHtml } from './print-sheet';

jest.mock('@/lib/supabase', () => ({
  getSupabase: () => {
    throw new Error('features must go through useApi, not the Supabase client');
  },
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-print', () => ({ printAsync: jest.fn() }));

const pass = (i: number): BulkPass => ({
  member_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  full_name: `Asha Fake ${i}`,
  branch_name: 'Test Branch',
  pass_version: 1,
  qr: `AIAIA1.qr-${i}`,
});

const setPlatform = (os: string) => {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
};
afterEach(() => setPlatform('ios'));

const mockBulk = jest.fn();
const api = {
  checkin: { bulkPasses: mockBulk },
  directory: { branches: jest.fn(() => Promise.resolve([])) },
  _client: {},
} as unknown as Api;

function wrap(node: React.ReactNode) {
  return (
    <ApiProvider api={api}>
      <QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>
    </ApiProvider>
  );
}

beforeEach(() => mockBulk.mockReset());

describe('bulk print layout', () => {
  it('chunks rows into 8 per A4 page', () => {
    expect(PASSES_PER_PAGE).toBe(8);
    const rows = Array.from({ length: 17 }, (_, i) => pass(i));
    expect(chunkPages(rows).map((p) => p.length)).toEqual([8, 8, 1]);
    expect(chunkPages(rows.slice(0, 8)).map((p) => p.length)).toEqual([8]);
    expect(chunkPages([])).toEqual([]);
    expect(chunkPages(rows).flat()).toEqual(rows);
  });

  it('builds one A4 page per 8 passes, each with its own QR, and escapes names', () => {
    const rows = Array.from({ length: 9 }, (_, i) => pass(i));
    rows[0] = { ...rows[0], full_name: 'Asha <b>Fake</b>' };
    const html = sheetHtml(
      'Sheet',
      rows,
      rows.map((r) => `<svg>${r.qr}</svg>`),
    );
    expect(html).toContain('@page{size:A4');
    expect(html.match(/<section class="page">/g)).toHaveLength(2);
    expect(html.match(/<div class="pass">/g)).toHaveLength(9);
    expect(html).toContain('<svg>AIAIA1.qr-8</svg>');
    expect(html).toContain('Asha &lt;b&gt;Fake&lt;/b&gt;');
    expect(html).not.toContain('<b>Fake</b>');
  });
});

describe('printSheet iframe', () => {
  it('is sandboxed without scripts, set before the document is loaded', async () => {
    const attrs: Record<string, string> = {};
    const order: string[] = [];
    const frame = {
      style: {} as Record<string, string>,
      contentWindow: { focus: jest.fn(), print: jest.fn() },
      remove: jest.fn(),
      onload: null as null | (() => void),
      setAttribute: (k: string, v: string) => {
        attrs[k] = v;
        order.push(k);
      },
      set srcdoc(_v: string) {
        order.push('srcdoc');
        queueMicrotask(() => frame.onload?.());
      },
    };
    const g = globalThis as { document?: unknown };
    const before = g.document;
    g.document = { createElement: () => frame, body: { appendChild: jest.fn() } };
    try {
      await printSheet('Event', []);
    } finally {
      g.document = before;
    }
    expect(attrs.sandbox).toBe('allow-modals allow-same-origin');
    expect(attrs.sandbox).not.toContain('allow-scripts');
    expect(order.indexOf('sandbox')).toBeLessThan(order.indexOf('srcdoc'));
    expect(frame.contentWindow.print).toHaveBeenCalled();
  });
});

describe('PrintSheetScreen', () => {
  it('refuses on native and never asks for signed passes', async () => {
    setPlatform('android');
    await render(wrap(<PrintSheetScreen scope={{ event_id: 'e1' }} />));
    expect(screen.getByText('Printing is available on the web admin console.')).toBeTruthy();
    expect(mockBulk).not.toHaveBeenCalled();
  });

  it('on web, loads the scope and shows the page count', async () => {
    setPlatform('web');
    mockBulk.mockResolvedValue(Array.from({ length: 10 }, (_, i) => pass(i)));
    await render(wrap(<PrintSheetScreen scope={{ event_id: 'e1' }} />));
    expect(await screen.findByText('10 passes')).toBeTruthy();
    expect(screen.getByText('2 A4 pages, 8 passes per page')).toBeTruthy();
    expect(mockBulk).toHaveBeenCalledWith({ event_id: 'e1' });
  });

  it('on web, a refused scope says so', async () => {
    setPlatform('web');
    mockBulk.mockRejectedValue(new PassError('not_allowed'));
    await render(wrap(<PrintSheetScreen scope={{ branch_id: 'b1' }} />));
    expect(
      await screen.findByText('You do not have the right to print passes for this list.'),
    ).toBeTruthy();
  });
});
