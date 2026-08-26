import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Pricing", description: "Contentra pricing and plan information." };

export default function PricingPage() {
  return <main className="public-page simple-page"><nav className="public-nav public-container"><Link href="/" className="brand"><span className="brand-mark">C</span>Contentra</Link><Link href="/signup" className="nav-cta">Get started <span aria-hidden="true">↗</span></Link></nav><section className="simple-hero public-container"><p className="eyebrow">Pricing</p><h1>Plans are taking shape.</h1><p>Contentra is actively defining its long-term plans. Sign up to explore the product while pricing and availability are finalized.</p><Link href="/signup" className="button button-primary">Get started <span aria-hidden="true">↗</span></Link></section><footer className="public-footer public-container"><span>Copyright {new Date().getFullYear()} Contentra</span><div><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div></footer></main>;
}