'use client';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useEffect } from 'react';

export function MarketingShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const move = (e: MouseEvent) => {
      document.documentElement.style.setProperty('--cursor-x', `${e.clientX}px`);
      document.documentElement.style.setProperty('--cursor-y', `${e.clientY}px`);
    };
    window.addEventListener('mousemove', move);
    return () => window.removeEventListener('mousemove', move);
  }, []);

  return (
    <div className="marketing-shell">
      <div className="cursor-glow" aria-hidden="true" />
      <header className="marketing-nav">
        <Link href="/" className="marketing-brand"><span className="brand-mark" aria-hidden="true" /><span>Contentra</span></Link>
        <nav className="marketing-links" aria-label="Marketing navigation">
          <Link href="/discover">Discover</Link>
          <Link href="/how-it-works">How it works</Link>
          <Link href="/resources">Resources</Link>
        </nav>
        <div className="marketing-actions"><Link href="/login" className="marketing-signin">Sign in</Link><Link href="/signup" className="btn btn-primary marketing-nav-cta">Get started <ArrowRight size={14} /></Link></div>
      </header>
      {children}
      <footer className="marketing-footer">
        <div><Link href="/" className="marketing-brand"><span className="brand-mark" aria-hidden="true" /><span>Contentra</span></Link><p>The operating system for creators, brands, businesses, and agencies.</p></div>
        <div className="marketing-footer-links">
          <div><strong>Product</strong><Link href="/discover">Discover</Link><Link href="/how-it-works">How it works</Link><Link href="/pricing">Pricing</Link></div>
          <div><strong>Resources</strong><Link href="/resources">Resources</Link><Link href="/changelog">Changelog</Link><Link href="/brandkit">Brand Kit</Link></div>
          <div><strong>Legal</strong><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div>
        </div>
        <div className="marketing-footer-bottom"><span>© {new Date().getFullYear()} Contentra. All rights reserved.</span><span>Built for people who take content seriously.</span></div>
      </footer>
    </div>
  );
}
