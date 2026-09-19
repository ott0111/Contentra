import Link from 'next/link';
import { ArrowUpRight, BookOpen, FileText, Palette, ShieldCheck, Sparkles } from 'lucide-react';
import { MarketingShell } from '@/components/marketing-shell';

const resources = [
  ['Pricing', 'See Contentra plans, included features, and current pricing.', '/pricing', Sparkles],
  ['Changelog', 'Follow product updates, improvements, and what we ship.', '/changelog', BookOpen],
  ['Brand Kit', 'Contentra logos, colors, marks, and brand resources.', '/brandkit', Palette],
  ['Terms', 'Read the terms that govern use of Contentra.', '/terms', FileText],
  ['Privacy', 'Learn how Contentra handles information and privacy.', '/privacy', ShieldCheck],
] as const;

export default function ResourcesPage() {
  return <MarketingShell><main className="marketing-main marketing-page">
    <section className="marketing-page-hero compact"><span className="section-label">Resources</span><h1>Everything you need to understand Contentra.</h1><p>Pricing, product updates, brand assets, and the legal documents that keep everything clear.</p></section>
    <section className="resource-grid">{resources.map(([title, body, href, Icon]) => <Link href={href} className="resource-card" key={title}><span className="feature-icon"><Icon size={18} /></span><div><h2>{title}</h2><p>{body}</p></div><ArrowUpRight size={17} /></Link>)}</section>
  </main></MarketingShell>;
}
