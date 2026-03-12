import Link from "next/link";
import { createOrganizationAction } from "@/app/dashboard/actions";
import {
  activityLabel,
  activitySummary,
  getActiveWorkspaceDetails,
  requireWorkspaceShellContext,
} from "@/lib/workspace/server";

type DashboardOverviewPageProps = {
  searchParams?: Promise<{
    error?: string;
    message?: string;
  }>;
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function DashboardOverviewPage({ searchParams }: DashboardOverviewPageProps) {
  const params = (await searchParams) ?? {};
  const { supabase, user, profile, organizations, activeOrganization, activeRole } = await requireWorkspaceShellContext();
  const { members, pendingInvites, billingSummary, visibleActivityLogs } = await getActiveWorkspaceDetails({
    supabase,
    activeOrganizationId: activeOrganization?.id ?? null,
    activeRole,
  });

  return (
    <div className="grid">
      <section className="panel">
        <p className="eyebrow">Overview</p>
        <h1>Workspace overview</h1>
        <p className="muted">
          The app shell is now split into focused surfaces: profile, organization, and billing settings each have
          their own route, while this page stays lightweight.
        </p>
        {params.error ? <p className="message">Error: {params.error}</p> : null}
        {params.message ? <p className="message">{params.message}</p> : null}
        <div className="actions">
          <Link href="/settings/profile" className="buttonSecondary">
            Edit profile
          </Link>
          <Link href="/settings/organization" className="buttonSecondary">
            Manage organization
          </Link>
          <Link href="/settings/billing" className="buttonSecondary">
            Review billing
          </Link>
        </div>
      </section>

      <section className="grid two">
        <article className="panel">
          <p className="eyebrow">Account</p>
          <h2>Current session</h2>
          <div className="card subtle">
            <strong>{profile?.full_name || "No profile name yet"}</strong>
            <p className="muted">{profile?.email ?? user.email ?? "Unknown email"}</p>
            <div className="meta">
              <span className="tag">{organizations.length} workspaces</span>
              <span className="tag">{activeRole ?? "No active role"}</span>
            </div>
          </div>
          {activeOrganization ? (
            <div className="card subtle topSpacing">
              <strong>{activeOrganization.name}</strong>
              <div className="meta">
                <span className="tag">{activeOrganization.slug}</span>
                <span className="tag">{members.length} members</span>
                <span className="tag">
                  {billingSummary ? `${billingSummary.effectivePlan.name} plan` : "No billing snapshot"}
                </span>
              </div>
            </div>
          ) : (
            <div className="card subtle topSpacing">
              <p className="muted">No active organization is selected yet. Create one to unlock the workspace flow.</p>
            </div>
          )}
        </article>

        <article className="panel">
          <p className="eyebrow">Create</p>
          <h2>Create an organization</h2>
          <p className="muted">
            This keeps organization creation on the overview page and leaves deeper management to the settings area.
          </p>
          <form action={createOrganizationAction} className="form">
            <input type="hidden" name="redirectTo" value="/dashboard" />
            <div className="field">
              <label htmlFor="org-name">Organization name</label>
              <input id="org-name" name="name" type="text" required />
            </div>
            <div className="field">
              <label htmlFor="org-slug">Organization slug</label>
              <input id="org-slug" name="slug" type="text" placeholder="optional-auto-generated" />
            </div>
            <button type="submit" className="button">
              Create organization
            </button>
          </form>
        </article>
      </section>

      {activeOrganization ? (
        <>
          <section className="grid three">
            <article className="card subtle">
              <h3>Team snapshot</h3>
              <div className="list compact">
                <div className="splitRow">
                  <span className="muted">Members</span>
                  <strong>{members.length}</strong>
                </div>
                <div className="splitRow">
                  <span className="muted">Pending invites</span>
                  <strong>{pendingInvites.length}</strong>
                </div>
              </div>
            </article>

            <article className="card subtle">
              <h3>Billing snapshot</h3>
              <div className="list compact">
                <div className="splitRow">
                  <span className="muted">Current plan</span>
                  <strong>{billingSummary?.effectivePlan.name ?? "Unavailable"}</strong>
                </div>
                <div className="splitRow">
                  <span className="muted">Seats remaining</span>
                  <strong>{billingSummary?.seatsRemaining ?? 0}</strong>
                </div>
              </div>
            </article>

            <article className="card subtle">
              <h3>Workspace status</h3>
              <div className="list compact">
                <div className="splitRow">
                  <span className="muted">Role</span>
                  <strong>{activeRole ?? "member"}</strong>
                </div>
                <div className="splitRow">
                  <span className="muted">Created</span>
                  <strong>{formatDate(activeOrganization.created_at)}</strong>
                </div>
              </div>
            </article>
          </section>

          <section className="panel">
            <p className="eyebrow">Activity</p>
            <h2>{activeOrganization.name} recent activity</h2>
            <div className="list">
              {visibleActivityLogs.length > 0 ? (
                visibleActivityLogs.slice(0, 6).map((activity) => (
                  <article key={activity.id} className="card subtle">
                    <div className="splitRow">
                      <div className="stack compactStack">
                        <strong>{activityLabel(activity.action)}</strong>
                        <span className="helper">{activitySummary(activity)}</span>
                      </div>
                      <span className="helper">{formatDate(activity.created_at)}</span>
                    </div>
                  </article>
                ))
              ) : (
                <div className="card subtle">
                  <p className="muted">No recent activity is visible inside the current plan retention window.</p>
                </div>
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
