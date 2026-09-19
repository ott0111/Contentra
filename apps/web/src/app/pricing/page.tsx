import Link from 'next/link';
import { Check, ArrowRight } from 'lucide-react';
import { MarketingShell } from '@/components/marketing-shell';

const plans = [
  { name: 'Free', price: '$0', description: 'Explore the Contentra workflow and build your first content system.', features: ['Core workspace','Content ideas and creation','Basic analytics','Content library','Limited AI usage'], cta: 'Start free', featured: false },
  { name: 'Pro', price: '$19.99', description: 'For creators and teams ready to make Contentra part of their weekly workflow.', features: ['Everything in Free','Higher AI limits','Advanced recommendations','Trend intelligence','More saves and planning capacity'], cta: 'Start Pro', featured: true },
  { name: 'Business', price: '$49.99', description: 'For businesses and agencies managing growth across more complex workflows.', features: ['Everything in Pro','Business workflows','Agency-ready workspace controls','Higher usage limits','Priority product access'], cta: 'Start Business', featured: false },
];

export default function PricingPage() {
  return <MarketingShell><main className="marketing-main pricing-page">
    <section className="pricing-hero"><span className="section-label">Pricing</span><h1>Simple plans. <span>Serious workflow.</span></h1><p>Start free, learn the system, and upgrade when Contentra becomes part of how you operate.</p></section>
    <section className="pricing-grid">{plans.map((plan) => <div className={'pricing-card ' + (plan.featured ? 'featured' : '')} key={plan.name}>
      {plan.featured && <div className="pricing-popular">Most popular</div>}
      <div className="pricing-card-top"><span className="pricing-name">{plan.name}</span><p>{plan.description}</p><div className="pricing-price">{plan.price}<small>/month</small></div></div>
      <Link href="/signup" className={'btn ' + (plan.featured ? 'btn-primary' : 'btn-secondary')}>{plan.cta} <ArrowRight size={14} /></Link>
      <div className="pricing-divider" /><strong>Includes</strong><ul>{plan.features.map((feature) => <li key={feature}><Check size={15} /> {feature}</li>)}</ul>
    </div>)}</section>
    <section className="pricing-note"><div><strong>Need more?</strong><p>Talk to us about a workflow built around your team, workspace structure, or agency needs.</p></div><Link href="/contact" className="text-link">Contact Contentra <ArrowRight size={14} /></Link></section>
  </main></MarketingShell>;
}
