import Link from 'next/link';
import { ArrowRight, BarChart3, Brain, CalendarDays, Lightbulb, Sparkles, TrendingUp } from 'lucide-react';
import { MarketingShell } from '@/components/marketing-shell';

const steps = [
  ['01', Brain, 'Start with your business context', 'Tell Contentra what you do, who you serve, your niche, goals, platforms, and brand preferences. Brand Brain turns that information into a useful foundation for the rest of the product.'],
  ['02', TrendingUp, 'Let intelligence find the signal', 'Contentra connects your context with trends, audience signals, and performance so you can see what deserves attention instead of starting from a blank page.'],
  ['03', Sparkles, 'Move through Creatos', 'Creatos gives you personalized opportunities to work through quickly. Keep what fits, skip what does not, or turn an idea into something you can create.'],
  ['04', Lightbulb, 'Create and remix', 'Use Create to turn an opportunity into hooks, captions, concepts, variations, and platform-native content while keeping your business context in the loop.'],
  ['05', CalendarDays, 'Plan the work', 'Use your library and calendar to save, schedule, and organize the content you actually want to publish.'],
  ['06', BarChart3, 'Learn from performance', 'Analytics closes the loop. Your results become context for the next recommendation, helping the workspace get more useful over time.'],
] as const;

export default function HowItWorksPage() {
  return <MarketingShell><main className="marketing-main marketing-page">
    <section className="marketing-page-hero"><span className="section-label">How it works</span><h1>From context to content, with a reason behind every move.</h1><p>Contentra is built around a simple loop: understand the business, find the opportunity, create around it, measure the result, and use what you learned next.</p></section>
    <section className="how-steps">{steps.map(([n, Icon, title, body]) => <article className="how-step" key={n}><div className="how-step-number">{n}</div><div className="how-step-icon"><Icon size={20} /></div><div><h2>{title}</h2><p>{body}</p></div></article>)}</section>
    <section className="cta-section"><div><span className="section-label">Ready to build?</span><h2>Give your content a system.</h2><p>Set up your workspace and let Contentra build the context for your next decision.</p></div><Link href="/signup" className="btn btn-primary btn-large">Create your workspace <ArrowRight size={16} /></Link></section>
  </main></MarketingShell>;
}
