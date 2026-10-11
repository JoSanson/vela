import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { userAgentFallback: '' }, session: {} }));

const { chromeLikeUserAgent } = await import('./sessions');

describe('chromeLikeUserAgent', () => {
  it('looks exactly like Chrome: no embedder tokens, reduced version', () => {
    const fallback =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Vela/44.7.0 Chrome/152.0.7977.130 Electron/44.7.0 Safari/537.36';
    expect(chromeLikeUserAgent(fallback)).toBe(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
    );
  });
});
