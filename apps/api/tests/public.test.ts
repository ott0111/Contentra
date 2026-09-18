import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../src/server.js';
import { prisma } from '../src/db.js';

// Funnel writes need a live database (localhost:5050). The analyzer endpoint
// never touches the database, so it runs in the default DB-free suite.
const DB_ENABLED = process.env.CONTENTRA_DB_TESTS === '1';

beforeAll(async () => {
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('public analyze-url endpoint (no auth)', () => {
  it('rejects a malformed body with a validation error', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/public/analyze-url',
      payload: { url: 'not-a-url' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects private hosts and credentials', async () => {
    const local = await app.inject({
      method: 'POST',
      url: '/api/v1/public/analyze-url',
      payload: { url: 'http://localhost' },
    });
    expect(local.statusCode).toBe(400);
    expect(local.json().error.code).toBe('URL_NOT_ALLOWED');

    const creds = await app.inject({
      method: 'POST',
      url: '/api/v1/public/analyze-url',
      payload: { url: 'https://user:pass@example.com' },
    });
    expect(creds.statusCode).toBe(400);
  });

  it('returns real metrics or an honest 503 — never fabricated', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/public/analyze-url',
      payload: { url: 'https://example.com' },
    });
    expect([200, 503]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const data = res.json().data;
      expect(typeof data.url).toBe('string');
      expect(typeof data.wordCount).toBe('number');
      expect(typeof data.readMinutes).toBe('number');
      expect(data.headings).toHaveProperty('h1');
      expect(typeof data.links).toBe('number');
    } else {
      expect(res.json().error.code).toBe('ANALYZER_UNAVAILABLE');
    }
  }, 30_000);
});

describe.skipIf(!DB_ENABLED)('public funnel-events endpoint (no auth)', () => {
  const eventName = `test.funnel.${Date.now()}`;

  afterAll(async () => {
    await prisma.funnelEvent
      .deleteMany({ where: { event: eventName } })
      .catch(() => undefined);
  });

  it('records an anonymous event without a session', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/public/funnel-events',
      payload: { event: eventName, label: 'landing' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.recorded).toBe(true);

    const stored = await prisma.funnelEvent.findFirst({
      where: { event: eventName },
    });
    expect(stored).not.toBeNull();
  });

  it('rejects a payload without an event name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/public/funnel-events',
      payload: { label: 'missing event' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});
