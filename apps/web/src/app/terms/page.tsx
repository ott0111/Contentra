import { MarketingShell } from '@/components/marketing-shell';

export default function TermsPage() {
  return <MarketingShell><main className="legal-page">
    <span className="section-label">Legal</span><h1>Terms of Service</h1><p className="legal-lead">These terms explain the basic rules for using Contentra.</p><span className="legal-updated">Last updated September 18, 2026</span>
    <div className="legal-content">
      <section><h2>Using Contentra</h2><p>You may use Contentra only for lawful purposes and in accordance with these terms. You are responsible for the information and content you add to your workspace.</p></section>
      <section><h2>Accounts</h2><p>Keep your login credentials secure and make sure information associated with your account is accurate. You are responsible for activity that occurs through your account.</p></section>
      <section><h2>Your content</h2><p>You retain ownership of content you submit to Contentra. You give Contentra the limited permissions needed to provide the services you request, such as processing information to generate or organize content.</p></section>
      <section><h2>Connected services</h2><p>If you connect a third-party platform, that connection may be subject to the third party's own terms and permissions. Contentra does not control those services.</p></section>
      <section><h2>Service availability</h2><p>Contentra is an evolving software service. Features may change, be limited, or temporarily become unavailable as the product develops.</p></section>
      <section><h2>Paid plans</h2><p>If you purchase a paid plan, billing, renewal, cancellation, and plan limits are presented during checkout or in your workspace. Contact us about billing questions.</p></section>
      <section><h2>Contact</h2><p>Questions about these terms can be sent through the Contact page.</p></section>
    </div>
  </main></MarketingShell>;
}
