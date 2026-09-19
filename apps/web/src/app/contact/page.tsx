import Link from 'next/link';
import { ArrowLeft, Mail } from 'lucide-react';
import { MarketingShell } from '@/components/marketing-shell';

export default function ContactPage() {
  return <MarketingShell><main className="contact-page"><div className="contact-card">
    <span className="section-label">Contact</span><h1>Let's talk.</h1>
    <p>Have a product question, partnership idea, billing issue, or something that is not working? Reach out and we will point you in the right direction.</p>
    <a className="contact-email" href="mailto:hello@contentra.app"><span><Mail size={18} /></span>hello@contentra.app</a>
    <Link href="/" className="text-link"><ArrowLeft size={14} /> Back to Contentra</Link>
  </div></main></MarketingShell>;
}
