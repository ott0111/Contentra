import Link from 'next/link';
import { ArrowRight, Check, Download } from 'lucide-react';
import { MarketingShell } from '@/components/marketing-shell';

export default function BrandKitPage() {
  return <MarketingShell><main className="marketing-main marketing-page">
    <section className="marketing-page-hero compact"><span className="section-label">Brand Kit</span><h1>The Contentra identity.</h1><p>Use the Contentra mark and colors consistently across product, community, partnerships, and media.</p></section>
    <section className="brandkit-grid"><div className="brandkit-preview dark"><span className="brand-mark large" /><h2>Contentra</h2><p>The operating system for creators.</p></div><div className="brandkit-card"><span className="section-label">Primary color</span><div className="brand-color"><span className="brand-color-swatch" /><div><b>Contentra Orange</b><code>#FF6A00</code></div></div><p>Use the orange gradient for primary product actions, active states, navigation accents, and key brand moments. Keep white as the main surface.</p><div className="brandkit-checks"><span><Check size={14}/> White/light surfaces</span><span><Check size={14}/> Near-black typography</span><span><Check size={14}/> Orange primary actions</span></div></div></section>
    <div className="brandkit-note"><Download size={16}/><span>Logo files can be added here as the official downloadable asset package is finalized.</span></div>
    <div className="marketing-page-back"><Link href="/resources">Back to resources <ArrowRight size={14}/></Link></div>
  </main></MarketingShell>;
}
