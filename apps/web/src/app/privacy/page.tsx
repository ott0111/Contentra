import { MarketingShell } from '@/components/marketing-shell';

export default function PrivacyPage() {
  return <MarketingShell><main className="legal-page">
    <span className="section-label">Legal</span><h1>Privacy Policy</h1><p className="legal-lead">This policy explains what information Contentra may collect and how it is used.</p><span className="legal-updated">Last updated September 18, 2026</span>
    <div className="legal-content">
      <section><h2>Information you provide</h2><p>We may collect account information, workspace information, onboarding responses, content you create, and information you choose to connect to Contentra.</p></section>
      <section><h2>How we use information</h2><p>We use information to authenticate accounts, operate workspaces, personalize product experiences, provide requested AI features, improve reliability, and communicate about the service.</p></section>
      <section><h2>Connected accounts</h2><p>When you connect a social or other third-party account, Contentra processes the information and permissions necessary to provide the connected feature. You can disconnect supported accounts from your workspace.</p></section>
      <section><h2>Analytics and logs</h2><p>We may collect technical information such as device, browser, request, and product usage data to secure the service, diagnose issues, and understand how the product is used.</p></section>
      <section><h2>Data sharing</h2><p>We do not sell your personal information. Information may be processed by service providers that help us host, secure, bill, analyze, or operate Contentra.</p></section>
      <section><h2>Security</h2><p>We use reasonable technical and organizational measures designed to protect information. No internet service can guarantee absolute security.</p></section>
      <section><h2>Your choices</h2><p>You can update account information and contact us about privacy questions or requests related to your information.</p></section>
    </div>
  </main></MarketingShell>;
}
