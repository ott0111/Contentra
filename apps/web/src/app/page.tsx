'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BarChart3, Check, ChevronRight, Lightbulb, RefreshCw, Sparkles, TrendingUp, Zap } from 'lucide-react';
import { api } from '@/lib/api';
import { MarketingShell } from '@/components/marketing-shell';

type Me = { workspaces: Array<{ workspace: { id: string; onboardedAt: string | null } }> };
const features = [
  { icon: Lightbulb, title: 'Know what to make', body: 'Turn your brand, audience, goals, and performance into ideas worth acting on.' },
  { icon: Sparkles, title: 'Create with context', body: 'Generate content around your actual business instead of starting from a blank prompt.' },
  { icon: RefreshCw, title: 'Remix what works', body: 'Turn proven ideas into new formats, hooks, angles, and platform-native content.' },
  { icon: TrendingUp, title: 'See what is moving', body: 'Understand trends and opportunities before your content calendar goes stale.' },
  { icon: BarChart3, title: 'Understand growth', body: 'Bring performance into one place and connect numbers to your next action.' },
  { icon: Zap, title: 'Move faster', body: 'Keep strategy, creation, planning, and execution in one operating system.' },
];
function track(event: string) { void api('/api/v1/public/funnel-events', { method: 'POST', body: JSON.stringify({ event }) }).catch(() => undefined); }

export default function Root() {
  const [ready, setReady] = useState(false);
  const tracked = useRef(false);
  useEffect(() => {
    let mounted = true;
    api<Me>('/api/v1/auth/me').then((data) => {
      if (!mounted) return;
      const saved = localStorage.getItem('contentra_workspace');
      const selected = data.workspaces.find((x) => x.workspace.id === saved)?.workspace ?? data.workspaces[0]?.workspace;
      if (!selected) window.location.assign('/app');
      else if (!selected.onboardedAt) window.location.assign('/onboarding');
      else window.location.assign('/home');
    }).catch(() => mounted && setReady(true));
    return () => { mounted = false; };
  }, []);
  useEffect(() => { if (ready && !tracked.current) { tracked.current = true; track('landing.view'); } }, [ready]);
  if (!ready) return null;
  return (
    <MarketingShell>
      <main className="marketing-main">
        <section className="hero-section">
          <div className="hero-copy">
            <div className="hero-kicker"><span className="hero-kicker-dot" /> The operating system for creators</div>
            <h1>Stop guessing what to post.<br /><span>Know what to do next.</span></h1>
            <p className="hero-subtitle">Contentra connects your business, content, audience, and performance so you can plan smarter, create faster, and keep growing.</p>
            <div className="hero-actions"><Link href="/signup" className="btn btn-primary btn-large">Start for free <ArrowRight size={16} /></Link><Link href="#product" className="hero-secondary">Explore Contentra <ChevronRight size={15} /></Link></div>
            <div className="hero-proof"><span><Check size={13} /> Free to get started</span><span><Check size={13} /> Built for creators, businesses & agencies</span><span><Check size={13} /> No credit card required</span></div>
          </div>
          <div className="hero-product">
            <div className="product-window">
              <div className="window-top"><div className="window-brand"><span className="mini-mark" /> Contentra</div><div className="window-status"><span /> Workspace</div></div>
              <div className="window-body">
                <div className="window-heading"><div><span className="window-eyebrow">Daily brief</span><h3>Your next move is clear.</h3><p>Your audience is responding to educational content. Double down on the format this week.</p></div><span className="window-badge">Next best action</span></div>
                <div className="window-metrics"><div><small>Views</small><strong>128.4K</strong><span>+18.2%</span></div><div><small>Reach</small><strong>84.7K</strong><span>+12.4%</span></div><div><small>Engagement</small><strong>7.8%</strong><span>+2.1%</span></div></div>
                <div className="window-grid">
                  <div className="window-card large"><div className="window-card-head"><strong>Opportunities</strong><span>3 found</span></div>
                    <div className="fake-row"><span className="fake-icon">↗</span><div><b>Turn your strongest topic into a series</b><small>High relevance · Instagram</small></div><ArrowRight size={14} /></div>
                    <div className="fake-row"><span className="fake-icon">✦</span><div><b>Remix your top performing hook</b><small>Medium effort · TikTok</small></div><ArrowRight size={14} /></div>
                    <div className="fake-row"><span className="fake-icon">◌</span><div><b>Build around a rising conversation</b><small>Fresh signal · X</small></div><ArrowRight size={14} /></div>
                  </div>
                  <div className="window-card"><div className="window-card-head"><strong>Content</strong><span>Recent</span></div><div className="mini-content"><span className="content-thumb one" /><div><b>3 lessons I learned...</b><small>Instagram · Published</small></div></div><div className="mini-content"><span className="content-thumb two" /><div><b>Why most creators...</b><small>TikTok · Draft</small></div></div></div>
                </div>
              </div>
            </div>
            <div className="hero-glow" />
          </div>
        </section>
        <section className="logo-strip"><span>One workspace for the entire content loop</span><div><b>IDEAS</b><i>→</i><b>CREATE</b><i>→</i><b>ANALYZE</b><i>→</i><b>NEXT ACTION</b></div></section>
        <section id="product" className="marketing-section product-showcase-section">
          <div className="section-intro"><span className="section-label">Inside Contentra</span><h2>A growth workspace built around your actual business.</h2><p>Every part of Contentra feeds the next. Your context informs creation, creation creates data, and performance turns into your next move.</p></div>
          <div className="product-showcase">
            <div className="showcase-copy"><span className="showcase-index">01</span><div><h3>Brand Brain</h3><p>Give Contentra the context behind your business. Your website, niche, audience, positioning, voice, and goals become the foundation for everything that follows.</p><div className="showcase-pills"><span>Business context</span><span>Audience</span><span>Brand voice</span></div></div></div>
            <div className="showcase-ui brain-ui"><div className="mock-sidebar"><b>Contentra</b><span className="active">Overview</span><span>Brand Brain</span><span>Blitz</span><span>Create</span><span>Library</span><span>Analytics</span></div><div className="mock-main"><div className="mock-top"><small>Brand Brain</small><span>Updated just now</span></div><h4>What Contentra knows about your business</h4><div className="mock-cards"><div><small>Positioning</small><b>Growth system for modern creators</b></div><div><small>Audience</small><b>Creators, businesses & agencies</b></div><div><small>Voice</small><b>Direct · useful · confident</b></div></div><div className="mock-insight"><span>✦</span><div><b>Context strength</b><p>Your brand context is ready to power recommendations across Contentra.</p></div><strong>92%</strong></div></div></div>
          </div>
          <div className="product-showcase reverse">
            <div className="showcase-copy"><span className="showcase-index">02</span><div><h3>Blitz</h3><p>Move through personalized opportunities quickly. Keep the ideas that fit, skip the noise, and save the ones worth creating.</p><div className="showcase-pills"><span>Keep</span><span>Remix</span><span>Schedule</span></div></div></div>
            <div className="showcase-ui blitz-ui"><div className="blitz-head"><div><small>Blitz session</small><h4>What should you do next?</h4></div><span>7 opportunities</span></div><div className="blitz-card"><div className="blitz-image"><span>CONTENT SIGNAL</span><b>Turn your strongest topic into a 3-part series</b></div><div className="blitz-details"><span className="signal">HIGH SIGNAL</span><h5>Educational content is outperforming your recent average.</h5><p>Use your existing winning topic and expand it across short-form platforms.</p><div className="blitz-actions"><button>Skip</button><button>Remix</button><button className="keep">Keep <ArrowRight size={13}/></button></div></div></div></div>
          </div>
          <div className="product-showcase">
            <div className="showcase-copy"><span className="showcase-index">03</span><div><h3>Create</h3><p>Turn a signal into something publishable. Generate ideas, hooks, captions, variations, and platform-specific versions without losing your brand context.</p><div className="showcase-pills"><span>Ideas</span><span>Hooks</span><span>Repurpose</span></div></div></div>
            <div className="showcase-ui create-ui"><div className="create-toolbar"><span className="active">Create</span><span>Remix</span><span>My content</span><button>+ New</button></div><div className="create-workspace"><div className="create-left"><small>CONTENT BRIEF</small><h4>3 lessons I learned building a creator business</h4><div className="fake-input">Hook <b>Most creators don't have a content problem...</b></div><div className="fake-input">Angle <b>Turn experience into a repeatable series</b></div></div><div className="create-preview"><span>PREVIEW · INSTAGRAM</span><div className="preview-box"><b>3 lessons I learned<br/>building a creator business</b><small>Save this for your next content sprint.</small></div><button>Generate variations</button></div></div></div>
          </div>
          <div className="product-showcase reverse">
            <div className="showcase-copy"><span className="showcase-index">04</span><div><h3>Analytics & Next Best Action</h3><p>Don't just watch numbers. Contentra connects performance to recommendations so you know what to repeat, change, or test next.</p><div className="showcase-pills"><span>Performance</span><span>Trends</span><span>Next action</span></div></div></div>
            <div className="showcase-ui analytics-ui"><div className="analytics-top"><div><small>Growth overview</small><h4>Performance this month</h4></div><span>Last 30 days⌄</span></div><div className="analytics-stats"><div><small>Reach</small><b>284.6K</b><span>+24.8%</span></div><div><small>Engagement</small><b>8.42%</b><span>+1.8%</span></div><div><small>Content</small><b>32</b><span>+9 this month</span></div></div><div className="chart"><div className="chart-line c1"/><div className="chart-line c2"/><span className="chart-label l1">Reach</span><span className="chart-label l2">Engagement</span></div><div className="next-action"><span>✦</span><div><small>NEXT BEST ACTION</small><b>Publish another educational short this week</b><p>Your recent educational posts are driving above-average saves.</p></div><ArrowRight size={15}/></div></div>
          </div>
        </section>
        <section className="marketing-section feature-overview"><div className="section-intro"><span className="section-label">The full system</span><h2>One workspace. Every part of the loop.</h2></div><div className="feature-grid">{features.map((feature) => <div className="feature-card" key={feature.title}><span className="feature-icon"><feature.icon size={18} /></span><h3>{feature.title}</h3><p>{feature.body}</p><span className="feature-arrow"><ArrowRight size={15} /></span></div>)}</div></section>
        <section id="how-it-works" className="workflow-section"><div className="workflow-copy"><span className="section-label">How it works</span><h2>From context to action in one continuous loop.</h2><p>Instead of another blank AI chat, Contentra builds a working model of your brand and uses it across the product.</p><Link href="/signup" className="text-link">Build your workspace <ArrowRight size={14} /></Link></div><div className="workflow-steps"><div><span>01</span><div><b>Connect your context</b><p>Tell Contentra what you do, who you serve, and where you publish.</p></div></div><div><span>02</span><div><b>Build your content system</b><p>Create, remix, organize, and plan without losing the strategy behind it.</p></div></div><div><span>03</span><div><b>Learn from performance</b><p>See what is working and let the next recommendation reflect the evidence.</p></div></div></div></section>
        <section className="cta-section"><div><span className="section-label">Start building</span><h2>Your content deserves a system.</h2><p>Set up your Contentra workspace and get your first recommendations working around your actual goals.</p></div><Link href="/signup" className="btn btn-primary btn-large">Create your workspace <ArrowRight size={16} /></Link></section>
      </main>
    </MarketingShell>
  );
}
