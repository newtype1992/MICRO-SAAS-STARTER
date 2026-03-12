import { SettingsNav } from "./settings-nav";

export default function SettingsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="grid">
      <section className="panel">
        <p className="eyebrow">Settings</p>
        <h1>Workspace settings</h1>
        <p className="muted">
          Dedicated screens for account, organization, and billing management.
        </p>
        <SettingsNav />
      </section>
      {children}
    </div>
  );
}
