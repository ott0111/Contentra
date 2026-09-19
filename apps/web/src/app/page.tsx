'use client';
import Link from 'next/link';
import { ArrowRight, BarChart3, Check, ChevronRight, Lightbulb, RefreshCw, TrendingUp, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { MarketingShell } from '@/components/marketing-shell';

type Me = { workspaces: Array<{ workspace: { id: string; onboardedAt: string | null } }> };
function track(event: string) { void api('/api/v1/public/funnel-events', { method: 'POST', body: JSON.stringify({ event }) }).catch(() => undefined); }

function ProductPreview() {
  return <div className="landing-app-preview">
    <div className="landing-preview-top"><div className="landing-preview-brand"><span className="brand-mark"/><b>Contentra</b></div><span className="preview-workspace">My workspace⌄</span><div className="preview-actions"><span>⌕</span><span>◦</span><span>•••</span></div></div>
    <div className="landing-preview-body">
      <div className="landing-preview-sidebar"><span className="preview-active">Home</span><span>Creatos</span><span>Create</span><span>Content</span><span>Library</span><span>Intelligence <i>PRO</i></span><span>Plan & Grow <i>PRO</i></span></div>
      <div className="landing-preview-main">
        <div className="preview-header"><div><small>WORKSPACE OVERVIEW</small><h3>Good to see you.</h3><p>Connect your business, see what matters, and know what to do next.</p></div><button>Find an opportunity</button></div>
        <div className="preview-nba"><div><small>NEXT BEST ACTION</small><h4>Turn your strongest topic into a series</h4><p>Your audience is responding to educational content. Double down on the format this week.</p><span>Based on your workspace · Actionable recommendation</span></div><button>Take action <ArrowRight size={12}/></button></div>
        <div className="preview-metrics"><div><span>Reach</span><b>84.7K</b><small>+12.4%</small></div><div><span>Views</span><b>128.4K</b><small>+18.2%</small></div><div><span>Published</span><b>24</b><small>This month</small></div><div><span>Engagement</span><b>7.8%</b><small>+2.1%</small></div></div>
        <div className="preview-section-title"><span>CONTENT INTELLIGENCE</span><b>What deserves your attention</b></div>
        <div className="preview-grid"><div className="preview-card opportunity"><small>TOP OPPORTUNITY</small><h4>Build a 3-part short-form series</h4><p>Expand the topic already driving above-average saves and retention.</p><div className="preview-why"><span>WHY IT MATTERS</span><p>It matches your audience and recent performance signals.</p></div><button>Create from this</button></div><div className="preview-card"><small>PERFORMANCE SIGNALS</small><div className="preview-signal"><b>01</b><div><strong>Educational posts are rising</strong><span>Above your recent average</span></div></div><div className="preview-signal"><b>02</b><div><strong>Reuse your winning hook</strong><span>High relevance this week</span></div></div><div className="preview-signal"><b>03</b><div><strong>Test a shorter format</strong><span>Low effort opportunity</span></div></div></div></div>
      </div>
    </div>
  </div>;
}

const features = [
  { icon: Lightbulb, title: 'Know what to make', body: 'Turn your brand, audience, goals, and performance into ideas worth acting on.' },
  { icon: Zap, title: 'Creatos', body: 'Rapidly move through personalized short-form opportunities and keep what fits your strategy.' },
  { icon: RefreshCw, title: 'Create & remix', body: 'Turn a signal into hooks, captions, variations, and platform-native content.' },
  { icon: TrendingUp, title: 'Trend intelligence', body: 'See what is moving and connect fresh signals to your actual business context.' },
  { icon: BarChart3, title: 'Analytics & action', body: 'Connect performance to recommendations instead of staring at disconnected numbers.' },
  { icon: Check, title: 'One operating system', body: 'Keep strategy, creation, planning, and execution connected in one workspace.' },
];

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
  return <MarketingShell>
    <main className="marketing-main">
      <section className="hero-section">
        <div className="hero-copy">
          <div className="hero-kicker"><span className="hero-kicker-dot"/> The operating system for creators</div>
          <h1>Stop guessing what to post.<br/><span>Know what to do next.</span></h1>
          <p className="hero-subtitle">Contentra connects your business, content, audience, and performance so you can plan smarter, create faster, and keep growing.</p>
          <div className="hero-actions"><Link href="/signup" className="btn btn-primary btn-large">Start for free <ArrowRight size={16}/></Link><Link href="#product" className="hero-secondary">See the product <ChevronRight size={15}/></Link></div>
          <div className="hero-proof"><span><Check size={13}/> Free to get started</span><span><Check size={13}/> Creators, businesses & agencies</span></div>
        </div>
        <ProductPreview/>
      </section>

      <section className="logo-strip"><span>Your entire content loop, connected</span><div><b>CONTEXT</b><i>→</i><b>INTELLIGENCE</b><i>→</i><b>CREATE</b><i>→</i><b>PERFORMANCE</b><i>→</i><b>NEXT ACTION</b></div></section>

      <section id="product" className="marketing-section">
        <div className="section-intro"><span className="section-label">Inside Contentra</span><h2>Actual product workflows, not fake feature screenshots.</h2><p>The interface below is built from the same product UI system used inside Contentra, so what you see is the experience we are actually building.</p></div>
        <div className="real-ui-showcase"><ProductPreview/></div>
      </section>

      <section className="marketing-section feature-overview"><div className="section-intro"><span className="section-label">The system</span><h2>Everything feeds the next decision.</h2></div><div className="feature-grid">{features.map((feature) => <div className="feature-card" key={feature.title}><span className="feature-icon"><feature.icon size={18}/></span><h3>{feature.title}</h3><p>{feature.body}</p><span className="feature-arrow"><ArrowRight size={15}/></span></div>)}</div></section>

      <section id="how-it-works" className="workflow-section"><div className="workflow-copy"><span className="section-label">How it works</span><h2>From business context to the next piece of content.</h2><p>Contentra learns your workspace, surfaces opportunities, helps you create, and uses performance to shape what comes next.</p><Link href="/signup" className="text-link">Build your workspace <ArrowRight size={14}/></Link></div><div className="workflow-steps"><div><span>01</span><div><b>Connect your context</b><p>Tell Contentra what you do, who you serve, and where you publish.</p></div></div><div><span>02</span><div><b>Move through Creatos</b><p>Quickly keep, skip, remix, save, and schedule the opportunities that fit.</p></div></div><div><span>03</span><div><b>Learn from performance</b><p>Analytics and intelligence turn results into the next recommendation.</p></div></div></div></section>

      <section className="cta-section"><div><span className="section-label">Start building</span><h2>Your content deserves a system.</h2><p>Set up your Contentra workspace and get your first recommendations working around your actual goals.</p></div><Link href="/signup" className="btn btn-primary btn-large">Create your workspace <ArrowRight size={16}/></Link></section>
    </main>
  </MarketingShell>;
}
