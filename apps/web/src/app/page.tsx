'use client';

import Link from 'next/link';
import { ArrowRight, BarChart3, CalendarDays, Check, ChevronRight, Lightbulb, Play, RefreshCw, Sparkles, TrendingUp, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { MarketingShell } from '@/components/marketing-shell';

type Me = { workspaces: Array<{ workspace: { id: string; onboardedAt: string | null } }> };

function track(event: string) {
  void api('/api/v1/public/funnel-events', { method: 'POST', body: JSON.stringify({ event }) }).catch(() => undefined);
}

function ProductPreview() {
  return <div className="landing-product-window">
    <div className="landing-window-bar">
      <div className="landing-window-dots"><i/><i/><i/></div>
      <span>Contentra</span>
      <span className="landing-window-status">Workspace overview</span>
    </div>
    <div className="landing-dashboard-preview">
      <aside>
        <div className="landing-preview-logo"><span className="brand-mark"/>Contentra</div>
        <div className="landing-preview-nav active">Home</div>
        <div className="landing-preview-nav">Creatos</div>
        <div className="landing-preview-nav">Create</div>
        <div className="landing-preview-nav">Content</div>
        <div className="landing-preview-nav">Library</div>
        <div className="landing-preview-label">INTELLIGENCE</div>
        <div className="landing-preview-nav">Inspiration</div>
        <div className="landing-preview-nav">Trend Intelligence</div>
        <div className="landing-preview-label">PLAN & GROW</div>
        <div className="landing-preview-nav">Calendar</div>
        <div className="landing-preview-nav">Analytics</div>
      </aside>
      <div className="landing-preview-content">
        <div className="landing-preview-heading">
          <div><small>WORKSPACE OVERVIEW</small><h3>Good to see you.</h3><p>Connect your business, see what matters, and know what to do next.</p></div>
          <button>Find an opportunity <ArrowRight size={12}/></button>
        </div>
        <div className="landing-nba"><div><span>NEXT BEST ACTION</span><strong>Turn your strongest topic into a series</strong><p>Your audience is responding to educational content. Double down on the format this week.</p></div><b>Take action <ArrowRight size={12}/></b></div>
        <div className="landing-metrics">
          <div><span>Reach</span><strong>84.7K</strong><small>+12.4%</small></div>
          <div><span>Views</span><strong>128.4K</strong><small>+18.2%</small></div>
          <div><span>Published</span><strong>24</strong><small>This month</small></div>
          <div><span>Engagement</span><strong>7.8%</strong><small>+2.1%</small></div>
        </div>
        <div className="landing-preview-section"><span>CONTENT INTELLIGENCE</span><h4>What deserves your attention</h4></div>
        <div className="landing-preview-cards">
          <div className="landing-preview-card featured"><span>TOP OPPORTUNITY</span><h4>Build a 3-part short-form series</h4><p>Expand the topic already driving above-average saves and retention.</p><div className="landing-why"><small>WHY IT MATTERS</small><p>It matches your audience and recent performance signals.</p></div><button>Create from this</button></div>
          <div className="landing-preview-card"><span>PERFORMANCE SIGNALS</span>{['Educational posts are rising','Reuse your winning hook','Test a shorter format'].map((x,i)=><div className="landing-signal" key={x}><b>0{i+1}</b><div><strong>{x}</strong><small>{i===0?'Above your recent average':i===1?'High relevance this week':'Low effort opportunity'}</small></div></div>)}</div>
        </div>
      </div>
    </div>
  </div>;
}

const features = [
  { Icon: Lightbulb, title: 'Know what to make', body: 'Turn your business, audience, goals, and performance into ideas worth acting on.' },
  { Icon: Sparkles, title: 'Creatos', body: 'Swipe through personalized content opportunities and keep the ones that fit.' },
  { Icon: RefreshCw, title: 'Create & remix', body: 'Turn a signal into hooks, scripts, captions, and platform-native content.' },
  { Icon: TrendingUp, title: 'Trend intelligence', body: 'Find fresh signals and connect them to your actual niche and audience.' },
  { Icon: BarChart3, title: 'Analytics & action', body: 'Understand what is working and turn performance into your next move.' },
  { Icon: CalendarDays, title: 'Plan everything', body: 'Organize content, schedule campaigns, and keep your publishing loop moving.' },
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

  useEffect(() => {
    if (ready && !tracked.current) {
      tracked.current = true;
      track('landing.view');
    }
  }, [ready]);

  if (!ready) return null;

  return <MarketingShell>
    <main className="saas-landing">
      <section className="saas-hero">
        <div className="saas-hero-copy">
          <span className="saas-badge"><span/> The operating system for creators</span>
          <h1>Turn your content into a <em>growth system.</em></h1>
          <p>Contentra connects your business, content, audience, and performance so you can plan smarter, create faster, and know what to do next.</p>
          <div className="saas-hero-actions">
            <Link href="/signup" className="btn btn-primary btn-large">Start for free <ArrowRight size={16}/></Link>
            <Link href="#product" className="saas-demo-link"><span className="saas-play"><Play size={12} fill="currentColor"/></span> See how it works</Link>
          </div>
          <div className="saas-proof"><span><Check size={14}/> Free to get started</span><span><Check size={14}/> No credit card</span><span><Check size={14}/> Built for creators & businesses</span></div>
        </div>
        <div className="saas-hero-product"><ProductPreview/></div>
      </section>

      <section className="saas-logo-row"><span>ONE WORKSPACE FOR YOUR ENTIRE CONTENT LOOP</span><div><b>CONTEXT</b><i>→</i><b>INTELLIGENCE</b><i>→</i><b>CREATE</b><i>→</i><b>PERFORMANCE</b><i>→</i><b>NEXT ACTION</b></div></section>

      <section id="product" className="saas-section">
        <div className="saas-section-heading"><span className="saas-eyebrow">Everything connected</span><h2>One system for everything<br/>that drives growth.</h2><p>Instead of bouncing between tools, Contentra keeps strategy, creation, planning, and performance connected.</p></div>
        <div className="saas-feature-grid">{features.map(({Icon,title,body})=><div className="saas-feature-card" key={title}><span className="saas-feature-icon"><Icon size={19}/></span><h3>{title}</h3><p>{body}</p><ChevronRight size={15} className="saas-feature-arrow"/></div>)}</div>
      </section>

      <section className="saas-showcase">
        <div className="saas-showcase-copy"><span className="saas-eyebrow">Your command center</span><h2>Stop staring at analytics. Start knowing what to do.</h2><p>Contentra turns your business context and performance signals into clear next actions, so every metric has a reason to exist.</p><Link href="/how-it-works" className="text-link">See how Contentra works <ArrowRight size={14}/></Link></div>
        <div className="saas-signal-stack"><div><span>01</span><strong>Understand</strong><p>Brand Brain learns your positioning, audience, voice, and goals.</p></div><div><span>02</span><strong>Decide</strong><p>Contentra surfaces the opportunities most relevant to your workspace.</p></div><div><span>03</span><strong>Create</strong><p>Turn the signal into content, remix it, save it, or schedule it.</p></div><div><span>04</span><strong>Improve</strong><p>Performance feeds back into the system and shapes what comes next.</p></div></div>
      </section>

      <section className="saas-stats-section"><div><strong>Creators</strong><span>Build a repeatable content engine</span></div><div><strong>Businesses</strong><span>Connect content to business outcomes</span></div><div><strong>Agencies</strong><span>Run multiple workspaces in one system</span></div><div><strong>1 loop</strong><span>Context → intelligence → action</span></div></section>

      <section className="saas-cta"><div><span className="saas-eyebrow">Ready when you are</span><h2>Your content deserves<br/><em>a system.</em></h2><p>Build your Contentra workspace and start making decisions with your actual business context.</p><Link href="/signup" className="btn btn-primary btn-large">Create your workspace <ArrowRight size={16}/></Link></div></section>
    </main>
  </MarketingShell>;
}
