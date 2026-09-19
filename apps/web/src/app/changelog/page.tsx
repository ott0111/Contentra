import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { MarketingShell } from '@/components/marketing-shell';

export default function ChangelogPage() {
  return <MarketingShell><main className="marketing-main marketing-page">
    <section className="marketing-page-hero compact"><span className="section-label">Changelog</span><h1>What we're shipping.</h1><p>Product updates, improvements, and the work behind Contentra.</p></section>
    <section className="changelog-list"><article className="changelog-item"><div className="changelog-meta"><span>September 2026</span><b>Current build</b></div><h2>Contentra product system</h2><p>We are bringing Brand Brain, Creatos, Create, intelligence, analytics, planning, and business workflows together into one operating system for creators, businesses, and agencies.</p><ul><li><CheckCircle2 size={15}/> Unified product navigation</li><li><CheckCircle2 size={15}/> Business-aware content intelligence</li><li><CheckCircle2 size={15}/> Creation, library, calendar, and analytics workflows</li></ul></article></section>
    <div className="marketing-page-back"><Link href="/resources">Back to resources <ArrowRight size={14}/></Link></div>
  </main></MarketingShell>;
}
