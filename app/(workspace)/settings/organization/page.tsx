import Link from "next/link";
import {
  inviteMemberAction,
  removeMemberAction,
  resendInviteAction,
  revokeInviteAction,
  updateMemberRoleAction,
} from "@/app/dashboard/actions";
import {
  asPending,
  getActiveWorkspaceDetails,
  historyLabel,
  requireWorkspaceShellContext,
} from "@/lib/workspace/server";
import { updateOrganizationDetailsAction } from "../actions";

type OrganizationSettingsPageProps = {
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

export default async function OrganizationSettingsPage({ searchParams }: OrganizationSettingsPageProps) {
  const params = (await searchParams) ?? {};
  const { supabase, activeOrganization, activeRole } = await requireWorkspaceShellContext();
  const { members, pendingInvites, inviteHistory, billingSummary } = await getActiveWorkspaceDetails({
    supabase,
    activeOrganizationId: activeOrganization?.id ?? null,
    activeRole,
  });

  if (!activeOrganization) {
    return (
      <section className="panel">
        <p className="eyebrow">Organization</p>
        <h2>No active workspace</h2>
        <p className="muted">Select or create an organization from the overview page before managing settings.</p>
      </section>
    );
  }

  const ownerControls = activeRole === "owner";

  return (
    <div className="grid">
      <section className="panel">
        <p className="eyebrow">Organization</p>
        <h2>{activeOrganization.name}</h2>
        <p className="muted">Workspace details, member management, invites, and retention-aware history live here.</p>
        {params.error ? <p className="message">Error: {params.error}</p> : null}
        {params.message ? <p className="message">{params.message}</p> : null}
        <div className="meta">
          <span className="tag">{activeOrganization.slug}</span>
          <span className="tag">{activeRole ?? "member"}</span>
          <span className="tag">{members.length} members</span>
        </div>
      </section>

      <section className="grid two">
        <article className="panel">
          <h3>Workspace details</h3>
          {ownerControls ? (
            <form action={updateOrganizationDetailsAction} className="form">
              <input type="hidden" name="organizationId" value={activeOrganization.id} />
              <div className="field">
                <label htmlFor="organization-name">Organization name</label>
                <input id="organization-name" name="name" type="text" defaultValue={activeOrganization.name} required />
              </div>
              <div className="field">
                <label htmlFor="organization-slug">Organization slug</label>
                <input id="organization-slug" name="slug" type="text" defaultValue={activeOrganization.slug} required />
              </div>
              <button type="submit" className="button">
                Save organization settings
              </button>
            </form>
          ) : (
            <div className="card subtle">
              <p className="muted">Only organization owners can update name and slug.</p>
            </div>
          )}
        </article>

        <article className="panel">
          <h3>Team summary</h3>
          <div className="list compact">
            <div className="card subtle">
              <span className="helper">Active members</span>
              <strong>{members.length}</strong>
            </div>
            <div className="card subtle">
              <span className="helper">Pending invites</span>
              <strong>{pendingInvites.length}</strong>
            </div>
            <div className="card subtle">
              <span className="helper">Seat capacity</span>
              <strong>
                {billingSummary ? `${billingSummary.usage.seatsUsed}/${billingSummary.effectivePlan.seatsIncluded}` : "n/a"}
              </strong>
            </div>
          </div>
          <p className="helper">
            Need more room? Move to the dedicated <Link href="/settings/billing">billing settings</Link> screen.
          </p>
        </article>
      </section>

      <section className="panel">
        <h3>Members</h3>
        <div className="list compact">
          {members.length > 0 ? (
            members.map((member) => (
              <div key={member.membership_id} className="card subtle">
                <div className="splitRow">
                  <div>
                    <strong>{member.email ?? member.user_id}</strong>
                    <div className="meta">
                      <span className="tag">{member.role}</span>
                      <span className="tag">{member.status}</span>
                      <span className="tag">{formatDate(member.created_at)}</span>
                    </div>
                  </div>
                  {ownerControls && member.role !== "owner" ? (
                    <div className="inline-actions">
                      <form action={updateMemberRoleAction}>
                        <input type="hidden" name="membershipId" value={member.membership_id} />
                        <input type="hidden" name="role" value={member.role === "admin" ? "member" : "admin"} />
                        <input type="hidden" name="redirectTo" value="/settings/organization" />
                        <button type="submit" className="buttonSecondary">
                          Make {member.role === "admin" ? "member" : "admin"}
                        </button>
                      </form>
                      <form action={removeMemberAction}>
                        <input type="hidden" name="membershipId" value={member.membership_id} />
                        <input type="hidden" name="redirectTo" value="/settings/organization" />
                        <button type="submit" className="dangerButton">
                          Remove
                        </button>
                      </form>
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <div className="card subtle">
              <p className="muted">No members are visible for this organization yet.</p>
            </div>
          )}
        </div>
      </section>

      {ownerControls ? (
        <>
          <section className="grid two">
            <article className="panel">
              <h3>Invite member</h3>
              <form action={inviteMemberAction} className="form">
                <input type="hidden" name="organizationId" value={activeOrganization.id} />
                <input type="hidden" name="redirectTo" value="/settings/organization" />
                <div className="field">
                  <label htmlFor="invite-email">Email</label>
                  <input id="invite-email" name="email" type="email" required />
                </div>
                <div className="field">
                  <label htmlFor="invite-role">Role</label>
                  <select id="invite-role" name="role" className="select">
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <button type="submit" className="button">
                  Send invite
                </button>
              </form>
            </article>

            <article className="panel">
              <h3>Pending invites</h3>
              <div className="list compact">
                {pendingInvites.length > 0 ? (
                  pendingInvites.map((invite) => (
                    <div key={invite.invite_id} className="card subtle">
                      <div className="stack">
                        <div className="splitRow">
                          <strong>{invite.email}</strong>
                          <div className="meta">
                            <span className="tag">{invite.role}</span>
                            <span className={`tag status-${invite.delivery_status}`}>{invite.delivery_status}</span>
                          </div>
                        </div>
                        <p className="helper mono">{`/invites/${invite.token}`}</p>
                        {invite.delivery_error ? <p className="helper dangerText">{invite.delivery_error}</p> : null}
                        <div className="splitRow">
                          <div className="stack compactStack">
                            <span className="helper">Expires {formatDate(invite.expires_at)}</span>
                            <span className="helper">
                              {invite.last_sent_at ? `Last sent ${formatDate(invite.last_sent_at)}` : "No email sent yet"}
                            </span>
                          </div>
                          <div className="inline-actions">
                            <form action={resendInviteAction}>
                              <input type="hidden" name="inviteId" value={invite.invite_id} />
                              <input type="hidden" name="redirectTo" value="/settings/organization" />
                              <button type="submit" className="buttonSecondary">
                                Resend
                              </button>
                            </form>
                            <form action={revokeInviteAction}>
                              <input type="hidden" name="inviteId" value={invite.invite_id} />
                              <input type="hidden" name="redirectTo" value="/settings/organization" />
                              <button type="submit" className="dangerButton">
                                Revoke
                              </button>
                            </form>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="card subtle">
                    <p className="muted">No pending invites.</p>
                  </div>
                )}
              </div>
            </article>
          </section>

          <section className="panel">
            <h3>Invite history</h3>
            <div className="list compact">
              {inviteHistory.length > 0 ? (
                inviteHistory.map((invite) => (
                  <div key={invite.invite_id} className="card subtle">
                    <div className="splitRow">
                      <div className="stack compactStack">
                        <strong>{invite.email}</strong>
                        <div className="meta">
                          <span className="tag">{invite.role}</span>
                          <span className={`tag status-${historyLabel(invite)}`}>{historyLabel(invite)}</span>
                          <span className={`tag status-${invite.delivery_status}`}>{invite.delivery_status}</span>
                        </div>
                      </div>
                      <div className="stack compactStack alignEnd">
                        <span className="helper">Created {formatDate(invite.created_at)}</span>
                        {invite.accepted_at ? <span className="helper">Accepted {formatDate(invite.accepted_at)}</span> : null}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="card subtle">
                  <p className="muted">No invite history is available inside the current plan retention window.</p>
                </div>
              )}
            </div>
            <p className="helper">
              Retention: {billingSummary?.effectivePlan.inviteHistoryLabel ?? "30-day invite history"}.
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}
