import Link from 'next/link';
import { ArrowLeft, FileText, ShieldCheck } from 'lucide-react';
import { MarketingShell } from '@/components/marketing-shell';

export default function LegalPage() {
  return <MarketingShell><main className="marketing-main marketing-page">
    <section className="marketing-page-hero compact"><span className="section-label">Legal</span><h1>Clear terms for using Contentra.</h1><p>Find the documents that explain how Contentra works, how information is handled, and the terms that apply when you use the platform.</p></section>
    <section className="resource-grid">
      <Link href="/terms" className="resource-card"><span className="feature-icon"><FileText size={18}/></span><div><h2>Terms of Service</h2><p>The rules and conditions for using Contentra.</p></div><ArrowLeft size={17}/></Link>
      <Link href="/privacy" className="resource-card"><span className="feature-icon"><ShieldCheck size={18}/></span><div><h2>Privacy Policy</h2><p>How Contentra handles information and privacy.</p></div><ArrowLeft size={17}/></Link>
    </section>
  </main></MarketingShell>;
}
