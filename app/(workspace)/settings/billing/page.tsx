import { openBillingPortalAction, startCheckoutAction } from "@/app/dashboard/actions";
import { PLAN_CATALOG } from "@/lib/billing/plans";
import { getActiveWorkspaceDetails, requireWorkspaceShellContext } from "@/lib/workspace/server";

type BillingSettingsPageProps = {
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

export default async function BillingSettingsPage({ searchParams }: BillingSettingsPageProps) {
  const params = (await searchParams) ?? {};
  const { supabase, activeOrganization, activeRole } = await requireWorkspaceShellContext();
  const { billing, billingSummary, canManageBilling, canViewBilling } = await getActiveWorkspaceDetails({
    supabase,
    activeOrganizationId: activeOrganization?.id ?? null,
    activeRole,
  });

  if (!activeOrganization) {
    return (
      <section className="panel">
        <p className="eyebrow">Billing</p>
        <h2>No active workspace</h2>
        <p className="muted">Select or create an organization before reviewing billing.</p>
      </section>
    );
  }

  return (
    <div className="grid">
      <section className="panel">
        <p className="eyebrow">Billing</p>
        <h2>{activeOrganization.name} billing settings</h2>
        <p className="muted">Plan review, seat limits, checkout, and billing portal access live on this screen.</p>
        {params.error ? <p className="message">Error: {params.error}</p> : null}
        {params.message ? <p className="message">{params.message}</p> : null}
      </section>

      {canViewBilling && billing && billingSummary ? (
        <>
          <section className="grid two">
            <article className="panel">
              <h3>
                {billingSummary.plan.name} plan
                {billingSummary.plan.key !== billingSummary.effectivePlan.key ? " (restricted access)" : ""}
              </h3>
              <p className="muted">{billingSummary.plan.description}</p>
              <div className="meta">
                <span className="tag">{billing.status}</span>
                <span className="tag">{billingSummary.usage.seatsUsed} seats used</span>
                <span className="tag">{billingSummary.effectivePlan.seatsIncluded} seats included</span>
              </div>
              {billing.current_period_end ? (
                <p className="helper">
                  Current period ends {formatDate(billing.current_period_end)}
                  {billing.cancel_at_period_end ? " and cancellation is scheduled." : "."}
                </p>
              ) : (
                <p className="helper">No paid billing period is active yet.</p>
              )}
            </article>

            <article className="panel">
              <h3>Entitlements</h3>
              <div className="list compact">
                <div className="card subtle">
                  <span className="helper">Seats remaining</span>
                  <strong>{billingSummary.seatsRemaining}</strong>
                </div>
                <div className="card subtle">
                  <span className="helper">Pending invites</span>
                  <strong>{billingSummary.usage.pendingInviteCount}</strong>
                </div>
                <div className="card subtle">
                  <span className="helper">History window</span>
                  <strong>{billingSummary.effectivePlan.inviteHistoryLabel}</strong>
                </div>
              </div>
            </article>
          </section>

          <section className="grid three">
            {Object.values(PLAN_CATALOG).map((plan) => {
              const isCurrentPlan = billing.plan_key === plan.key;
              const isFreePlan = plan.key === "free";

              return (
                <article key={plan.key} className={`card subtle ${isCurrentPlan ? "activeCard" : ""}`}>
                  <div className="stack">
                    <div>
                      <h3>{plan.name}</h3>
                      <p className="muted">{plan.description}</p>
                    </div>
                    <div className="list compact">
                      <div className="splitRow">
                        <span className="muted">Seats</span>
                        <strong>{plan.seatsIncluded}</strong>
                      </div>
                      <div className="splitRow">
                        <span className="muted">Invite history</span>
                        <strong>{plan.inviteHistoryLabel}</strong>
                      </div>
                    </div>
                    {isCurrentPlan ? (
                      <span className="tag">Current plan</span>
                    ) : canManageBilling && !isFreePlan ? (
                      <form action={startCheckoutAction}>
                        <input type="hidden" name="organizationId" value={activeOrganization.id} />
                        <input type="hidden" name="planKey" value={plan.key} />
                        <input type="hidden" name="redirectTo" value="/settings/billing" />
                        <button type="submit" className="button">
                          Upgrade to {plan.name}
                        </button>
                      </form>
                    ) : (
                      <span className="tag">{isFreePlan ? "Starter tier" : "Owner managed"}</span>
                    )}
                  </div>
                </article>
              );
            })}
          </section>

          {canManageBilling ? (
            <section className="panel">
              <h3>Owner actions</h3>
              <p className="muted">Only owners can launch checkout or open the billing portal for the active workspace.</p>
              <form action={openBillingPortalAction}>
                <input type="hidden" name="organizationId" value={activeOrganization.id} />
                <input type="hidden" name="redirectTo" value="/settings/billing" />
                <button type="submit" className="buttonSecondary">
                  Open billing portal
                </button>
              </form>
            </section>
          ) : (
            <section className="panel">
              <h3>Billing access</h3>
              <p className="muted">You can review billing, but only organization owners can change plans or open the portal.</p>
            </section>
          )}
        </>
      ) : (
        <section className="panel">
          <h3>Billing access is restricted</h3>
          <p className="muted">Only organization admins and owners can view billing for this workspace.</p>
        </section>
      )}
    </div>
  );
}
