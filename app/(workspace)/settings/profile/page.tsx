import { updateProfileAction } from "../actions";
import { requireWorkspaceShellContext } from "@/lib/workspace/server";

type ProfileSettingsPageProps = {
  searchParams?: Promise<{
    error?: string;
    message?: string;
  }>;
};

export default async function ProfileSettingsPage({ searchParams }: ProfileSettingsPageProps) {
  const params = (await searchParams) ?? {};
  const { profile, user, organizations, activeOrganization } = await requireWorkspaceShellContext();

  return (
    <div className="grid">
      <section className="panel">
        <p className="eyebrow">Profile</p>
        <h2>Account settings</h2>
        <p className="muted">
          Keep profile information separate from workspace administration so the starter has a cleaner default IA.
        </p>
        {params.error ? <p className="message">Error: {params.error}</p> : null}
        {params.message ? <p className="message">{params.message}</p> : null}
      </section>

      <section className="grid two">
        <article className="panel">
          <h3>Identity</h3>
          <div className="list compact">
            <div className="card subtle">
              <span className="helper">Email</span>
              <strong>{profile?.email ?? user.email ?? "Unknown email"}</strong>
            </div>
            <div className="card subtle">
              <span className="helper">User ID</span>
              <p className="helper mono">{user.id}</p>
            </div>
            <div className="card subtle">
              <span className="helper">Workspace access</span>
              <strong>{organizations.length} organizations</strong>
              <p className="helper">
                {activeOrganization ? `Active workspace: ${activeOrganization.name}` : "No active workspace selected yet."}
              </p>
            </div>
          </div>
        </article>

        <article className="panel">
          <h3>Public profile</h3>
          <form action={updateProfileAction} className="form">
            <div className="field">
              <label htmlFor="full-name">Full name</label>
              <input
                id="full-name"
                name="fullName"
                type="text"
                defaultValue={profile?.full_name ?? ""}
                placeholder="Your display name"
              />
            </div>
            <button type="submit" className="button">
              Save profile
            </button>
          </form>
          <p className="helper">Email and authentication methods remain managed by Supabase Auth.</p>
        </article>
      </section>
    </div>
  );
}
