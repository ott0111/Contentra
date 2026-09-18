'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { BarChart3, RefreshCw, Search, Share2, Sparkles, TrendingUp } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { api, ApiClientError } from '@/lib/api';

type Me = {
  workspaces: Array<{ workspace: { id: string; onboardedAt: string | null } }>;
};

type Analysis = {
  url: string;
  title: string | null;
  description: string | null;
  wordCount: number;
  readMinutes: number;
  headings: { h1: number; h2: number };
  images: number;
  links: number;
  hasOpenGraph: boolean;
};

const features = [
  { t: 'Create Better Content', d: 'Generate content ideas, hooks, posts, scripts, and formats built around your brand and audience.', Icon: Sparkles },
  { t: 'Discover What\u2019s Trending', d: 'Find emerging trends and proven content opportunities before they pass you by.', Icon: TrendingUp },
  { t: 'Remix What Works', d: 'Turn proven content into new ideas tailored to your niche, brand, and audience.', Icon: RefreshCw },
  { t: 'Publish Everywhere', d: 'Plan, organize, and publish your content across your connected social platforms from one place.', Icon: Share2 },
  { t: 'Understand Your Growth', d: 'Track your content performance and turn your analytics into clear next actions.', Icon: BarChart3 },
];

function trackFunnel(event: string, extra: Record<string, unknown> = {}) {
  void api('/api/v1/public/funnel-events', {
    method: 'POST',
    body: JSON.stringify({ event, ...extra }),
  }).catch(() => undefined);
}

export default function Root() {
  const [anon, setAnon] = useState(false);
  const [ref, setRef] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Analysis | null>(null);
  const tracked = useRef(false);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('ref');
    if (value) setRef(value.trim().toUpperCase());
  }, []);

  useEffect(() => {
    let mounted = true;
    api<Me>('/api/v1/auth/me')
      .then((data) => {
        if (!mounted) return;
        const saved = localStorage.getItem('contentra_workspace');
        const selected =
          data.workspaces.find((x) => x.workspace.id === saved)?.workspace ??
          data.workspaces[0]?.workspace;
        // A signed-in visitor keeps the original routing; the landing only
        // replaces the logged-out experience.
        if (!selected) window.location.assign('/app');
        else if (!selected.onboardedAt) window.location.assign('/onboarding');
        else window.location.assign('/app');
      })
      .catch(() => {
        if (mounted) setAnon(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!anon || tracked.current) return;
    tracked.current = true;
    trackFunnel('landing.view', ref ? { ref } : {});
  }, [anon, ref]);

  async function analyze(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = url.trim();
    if (!value) return;
    setBusy(true);
    setError('');
    setResult(null);
    trackFunnel('analyzer.run', { meta: { url: value } });
    try {
      const data = await api<Analysis>('/api/v1/public/analyze-url', {
        method: 'POST',
        body: JSON.stringify({ url: value }),
      });
      setResult(data);
      trackFunnel('analyzer.result', { meta: { url: value } });
    } catch (err) {
      // Never fabricate a result: surface the API's honest error instead.
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'We could not reach the analyzer right now. Please try again shortly.',
      );
      trackFunnel('analyzer.error', { meta: { url: value } });
    } finally {
      setBusy(false);
    }
  }

  const signupHref = ref ? `/signup?ref=${encodeURIComponent(ref)}` : '/signup';

  return (
    <main className="auth-split">
      <section className="auth-left">
        <Link href="/" className="auth-brand">
          <span className="brand-mark" aria-hidden="true" />
          Contentra
        </Link>
        <div className="auth-left-copy">
          <span className="badge">For creators who want to grow</span>
          <h1>The operating system for creators</h1>
          <p>
            Contentra helps creators plan, create, and understand their content —
            so you always know what is working and exactly what to make next.
          </p>
          <div className="auth-features">
            {features.map((f) => (
              <div className="auth-feature" key={f.t}>
                <span className="auth-feature-icon">
                  <f.Icon size={16} aria-hidden="true" />
                </span>
                <div>
                  <h3>{f.t}</h3>
                  <p>{f.d}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="landing-cta">
            <Button href={signupHref}>Create your free account</Button>
            <Link href="/login" className="text-btn">
              Sign in
            </Link>
          </div>
          {ref && (
            <p className="auth-claim" style={{ marginTop: 14 }}>
              Referral <strong>{ref}</strong> applied — your friend&apos;s reward
              unlocks once you finish setup.
            </p>
          )}
        </div>
        <p className="auth-claim">Your Content. Your Growth. One Operating System.</p>
      </section>
      <section className="auth-right">
        <div className="auth-right-card">
          <h1>Analyze any public page — no signup</h1>
          <p>
            Paste a URL to see basic content signals from any public page. It is
            free, instant, and honest about what it can and cannot reach.
          </p>
          <form className="form" onSubmit={analyze}>
            <label className="field">
              <span>Website URL</span>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                type="url"
                inputMode="url"
                autoComplete="url"
                placeholder="https://example.com"
                required
              />
            </label>
            <Button type="submit" disabled={busy}>
              {busy ? 'Analyzing…' : 'Analyze website'}
            </Button>
          </form>
          {error && (
            <div
              className="empty"
              role="alert"
              style={{ padding: 12, marginTop: 16, color: 'var(--danger)' }}
            >
              {error}
            </div>
          )}
          {result && (
            <div data-testid="analyzer-result">
              <Card
                className="landing-result"
                style={{ marginTop: 16 }}
              >
                <div className="card-top">
                  <span className="badge">Analysis</span>
                  <span className="muted">{result.readMinutes} min read</span>
                </div>
                <h3>{result.title ?? 'Untitled page'}</h3>
                {result.description && <p>{result.description}</p>}
                <div className="grid grid-2" style={{ marginTop: 14 }}>
                  <div className="metric">
                    <span>Words</span>
                    <strong>{result.wordCount}</strong>
                  </div>
                  <div className="metric">
                    <span>Headings</span>
                    <strong>
                      H1 {result.headings.h1} · H2 {result.headings.h2}
                    </strong>
                  </div>
                  <div className="metric">
                    <span>Images</span>
                    <strong>{result.images}</strong>
                  </div>
                  <div className="metric">
                    <span>Links</span>
                    <strong>{result.links}</strong>
                  </div>
                </div>
                <p className="muted" style={{ marginTop: 12 }}>
                  {result.hasOpenGraph
                    ? 'Open Graph tags detected — this page is ready to share.'
                    : 'No Open Graph tags detected — share previews may be weaker.'}
                </p>
              </Card>
            </div>
          )}
          <p className="auth-foot">
            <Search size={12} aria-hidden="true" /> Sign up to save analyses and
            turn them into a content plan.
          </p>
        </div>
      </section>
    </main>
  );
}
