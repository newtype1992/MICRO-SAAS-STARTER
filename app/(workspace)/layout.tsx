import { setActiveOrganizationAction, signOutAction } from "@/app/dashboard/actions";
import { requireWorkspaceShellContext } from "@/lib/workspace/server";
import { WorkspaceNav } from "./workspace-nav";

export default async function WorkspaceLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { activeOrganization, activeRole, organizations, profile } = await requireWorkspaceShellContext();

  return (
    <main className="workspaceLayout">
      <aside className="workspaceSidebar panel">
        <div className="stack">
          <div>
            <p className="eyebrow">App Shell</p>
            <h1 className="workspaceHeading">Starter workspace</h1>
            <p className="muted">
              Shared navigation, active organization context, and dedicated settings screens.
            </p>
          </div>

          <div className="card subtle">
            <h3>Current account</h3>
            <p className="muted">{profile?.email ?? "Unknown email"}</p>
            <div className="meta">
              <span className="tag">{profile?.full_name || "No profile name yet"}</span>
              <span className="tag">{activeRole ?? "No active role"}</span>
            </div>
          </div>

          <div className="stack compactStack">
            <h3 className="sectionLabel">Workspace navigation</h3>
            <WorkspaceNav />
          </div>

          <div className="stack compactStack">
            <h3 className="sectionLabel">Active organization</h3>
            {activeOrganization ? (
              <>
                <div className="card subtle">
                  <strong>{activeOrganization.name}</strong>
                  <div className="meta topSpacing">
                    <span className="tag">{activeOrganization.slug}</span>
                    <span className="tag">{activeRole ?? "member"}</span>
                  </div>
                </div>
                <form action={setActiveOrganizationAction} className="form">
                  <input type="hidden" name="redirectTo" value="/dashboard" />
                  <div className="field">
                    <label htmlFor="active-org-picker">Switch workspace</label>
                    <select
                      id="active-org-picker"
                      name="organizationId"
                      className="select"
                      defaultValue={activeOrganization.id}
                    >
                      {organizations.map((organization) => (
                        <option key={organization.id} value={organization.id}>
                          {organization.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button type="submit" className="buttonSecondary">
                    Update active workspace
                  </button>
                </form>
              </>
            ) : (
              <div className="card subtle">
                <p className="muted">Create an organization from the overview screen to begin.</p>
              </div>
            )}
          </div>

          <form action={signOutAction}>
            <button type="submit" className="dangerButton">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <section className="workspaceMain">{children}</section>
    </main>
  );
}
