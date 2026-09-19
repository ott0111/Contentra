import Link from 'next/link';
import { ArrowRight, BarChart3, Brain, CalendarDays, Lightbulb, Sparkles, TrendingUp } from 'lucide-react';
import { MarketingShell } from '@/components/marketing-shell';

const features = [
  ['Brand Brain', 'Build a living understanding of your business, audience, positioning, voice, and context.', Brain],
  ['Creatos', 'Move through personalized content opportunities and quickly keep, skip, remix, save, or schedule.', Sparkles],
  ['Create', 'Turn an opportunity into hooks, captions, concepts, and platform-ready content.', Lightbulb],
  ['Content Intelligence', 'Connect trends, performance, and business context so recommendations have a reason behind them.', TrendingUp],
  ['Analytics', 'See what is working and turn performance into clear next actions instead of disconnected numbers.', BarChart3],
  ['Plan & Grow', 'Keep your calendar, campaigns, and growth workflows connected to the rest of your workspace.', CalendarDays],
] as const;

export default function DiscoverPage() {
  return <MarketingShell><main className="marketing-main marketing-page">
    <section className="marketing-page-hero"><span className="section-label">Discover Contentra</span><h1>One system for the whole content loop.</h1><p>Contentra brings business context, intelligence, creation, planning, and performance into one workspace so you always have a clearer next move.</p><div className="hero-actions"><Link href="/signup" className="btn btn-primary btn-large">Start for free <ArrowRight size={16} /></Link><Link href="/how-it-works" className="hero-secondary">See how it works <ArrowRight size={15} /></Link></div></section>
    <section className="marketing-section"><div className="feature-grid discover-feature-grid">{features.map(([title, body, Icon]) => <article className="feature-card" key={title}><span className="feature-icon"><Icon size={18} /></span><h3>{title}</h3><p>{body}</p></article>)}</div></section>
    <section className="workflow-section"><div className="workflow-copy"><span className="section-label">The loop</span><h2>Context in. Better decisions out.</h2><p>Contentra is designed so every part of the product feeds the next one. Your business context informs ideas, ideas become content, and performance informs what happens next.</p></div><div className="workflow-steps"><div><span>01</span><div><b>Understand</b><p>Brand Brain learns the context behind your workspace.</p></div></div><div><span>02</span><div><b>Decide</b><p>Intelligence surfaces opportunities worth your attention.</p></div></div><div><span>03</span><div><b>Create</b><p>Create, remix, plan, and publish around the opportunity.</p></div></div><div><span>04</span><div><b>Improve</b><p>Analytics turns results into the next recommendation.</p></div></div></div></section>
  </main></MarketingShell>;
}
