"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  buildEntitlementSummary,
  getOrganizationBillingUsage,
  getOrganizationSubscription,
  recordOrganizationActivity,
  updateOrganizationCustomerId,
} from "@/lib/billing/server";
import { isPlanKey, type PlanKey } from "@/lib/billing/plans";
import { setActiveOrganizationIdCookie } from "@/lib/organizations/active";
import { sendInviteEmail } from "@/lib/email/invite";
import { createStripeServerClient, getStripeLookupKeyForPlan, stripeIsConfigured } from "@/lib/stripe/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function appOrigin(headerOrigin: string | null) {
  return headerOrigin || process.env.APP_URL || "http://localhost:3000";
}

function resolveRedirectTarget(formData: FormData, fallbackPath: string) {
  const redirectTo = String(formData.get("redirectTo") || "").trim();

  if (redirectTo.startsWith("/") && !redirectTo.startsWith("//")) {
    return redirectTo;
  }

  return fallbackPath;
}

function withFlash(path: string, type: "error" | "message", value: string) {
  const url = new URL(path, "http://localhost");
  url.searchParams.set(type, value);
  return `${url.pathname}${url.search}`;
}

type InviteRecord = {
  id: string;
  organization_id: string;
  email: string;
  role: string;
  token: string;
};

type OrganizationRecord = {
  id: string;
};

async function requireAuthenticatedUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth?error=You%20must%20sign%20in%20first.");
  }

  return { supabase, user };
}

async function requireOrganizationOwner(organizationId: string) {
  const { supabase, user } = await requireAuthenticatedUser();
  const { data: membership, error } = await supabase
    .from("memberships")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .maybeSingle<{ role: string }>();

  if (error || !membership || membership.role !== "owner") {
    redirect("/dashboard?error=Only%20organization%20owners%20can%20manage%20billing.");
  }

  return { supabase, user };
}

export async function createOrganizationAction(formData: FormData) {
  const { supabase } = await requireAuthenticatedUser();
  const redirectTo = resolveRedirectTarget(formData, "/dashboard");

  const name = String(formData.get("name") || "").trim();
  const rawSlug = String(formData.get("slug") || "").trim();
  const slug = rawSlug ? slugify(rawSlug) : slugify(name);

  const { data, error } = await supabase
    .rpc("create_organization", {
      p_name: name,
      p_slug: slug || null,
    })
    .single<OrganizationRecord>();

  if (error) {
    redirect(withFlash(redirectTo, "error", error.message));
  }

  if (data?.id) {
    await setActiveOrganizationIdCookie(data.id);
  }

  redirect(withFlash(redirectTo, "message", "Organization created."));
}

export async function setActiveOrganizationAction(formData: FormData) {
  const organizationId = String(formData.get("organizationId") || "").trim();
  const redirectTo = resolveRedirectTarget(formData, "/dashboard");
  const { supabase, user } = await requireAuthenticatedUser();

  const { data: membership, error } = await supabase
    .from("memberships")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("organization_id", organizationId)
    .maybeSingle<{ organization_id: string }>();

  if (error || !membership) {
    redirect(withFlash(redirectTo, "error", "That organization is not available to this account."));
  }

  await setActiveOrganizationIdCookie(organizationId);
  redirect(withFlash(redirectTo, "message", "Active organization updated."));
}

export async function inviteMemberAction(formData: FormData) {
  const organizationId = String(formData.get("organizationId") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const role = String(formData.get("role") || "member").trim();
  const redirectTo = resolveRedirectTarget(formData, "/settings/organization");

  const { supabase, user } = await requireAuthenticatedUser();
  const [subscription, usage] = await Promise.all([
    getOrganizationSubscription(supabase, organizationId),
    getOrganizationBillingUsage(supabase, organizationId),
  ]);
  const entitlementSummary = buildEntitlementSummary(subscription, usage);

  if (!entitlementSummary.canInviteMore) {
    redirect(
      withFlash(
        redirectTo,
        "error",
        `This workspace is at its ${entitlementSummary.effectivePlan.name} seat limit. Upgrade billing before inviting more members.`
      )
    );
  }

  const { data: invite, error } = await supabase
    .rpc("invite_organization_member", {
      p_organization_id: organizationId,
      p_email: email,
      p_role: role,
    })
    .single<InviteRecord>();

  if (error || !invite) {
    redirect(withFlash(redirectTo, "error", error?.message || "Unable to create invite."));
  }

  const { data: organization } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", organizationId)
    .single<{ name: string }>();

  const inviteUrl = `${appOrigin((await headers()).get("origin"))}/invites/${invite.token}`;
  const emailResult = await sendInviteEmail({
    inviteeEmail: invite.email,
    inviterEmail: user?.email || "Unknown inviter",
    inviteRole: invite.role,
    inviteUrl,
    organizationName: organization?.name || "your organization",
  });

  await supabase.rpc("record_invite_delivery", {
    p_invite_id: invite.id,
    p_delivery_status: emailResult.status,
    p_delivery_error: emailResult.status === "sent" ? null : emailResult.reason,
  });

  if (emailResult.status === "sent") {
    redirect(withFlash(redirectTo, "message", "Invite created and email sent."));
  }

  redirect(withFlash(redirectTo, "message", emailResult.reason));
}

export async function resendInviteAction(formData: FormData) {
  const inviteId = String(formData.get("inviteId") || "").trim();
  const redirectTo = resolveRedirectTarget(formData, "/settings/organization");
  const { supabase, user } = await requireAuthenticatedUser();
  const { data: invite, error } = await supabase
    .from("organization_invites")
    .select("id, organization_id, email, role, token, status")
    .eq("id", inviteId)
    .single<InviteRecord & { status: string }>();

  if (error || !invite) {
    redirect(withFlash(redirectTo, "error", error?.message || "Unable to load invite."));
  }

  if (invite.status !== "pending") {
    redirect(withFlash(redirectTo, "error", "Only pending invites can be resent."));
  }

  const { data: organization } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", invite.organization_id)
    .single<{ name: string }>();

  const inviteUrl = `${appOrigin((await headers()).get("origin"))}/invites/${invite.token}`;
  const emailResult = await sendInviteEmail({
    inviteeEmail: invite.email,
    inviterEmail: user?.email || "Unknown inviter",
    inviteRole: invite.role,
    inviteUrl,
    organizationName: organization?.name || "your organization",
  });

  await supabase.rpc("record_invite_delivery", {
    p_invite_id: invite.id,
    p_delivery_status: emailResult.status,
    p_delivery_error: emailResult.status === "sent" ? null : emailResult.reason,
  });

  if (emailResult.status === "sent") {
    redirect(withFlash(redirectTo, "message", "Invite email resent."));
  }

  redirect(withFlash(redirectTo, "message", emailResult.reason));
}

export async function revokeInviteAction(formData: FormData) {
  const inviteId = String(formData.get("inviteId") || "").trim();
  const redirectTo = resolveRedirectTarget(formData, "/settings/organization");
  const { supabase } = await requireAuthenticatedUser();
  const { error } = await supabase.rpc("revoke_organization_invite", {
    p_invite_id: inviteId,
  });

  if (error) {
    redirect(withFlash(redirectTo, "error", error.message));
  }

  redirect(withFlash(redirectTo, "message", "Invite revoked."));
}

export async function updateMemberRoleAction(formData: FormData) {
  const membershipId = String(formData.get("membershipId") || "").trim();
  const role = String(formData.get("role") || "").trim();
  const redirectTo = resolveRedirectTarget(formData, "/settings/organization");

  const { supabase } = await requireAuthenticatedUser();
  const { error } = await supabase.rpc("update_organization_member_role", {
    p_membership_id: membershipId,
    p_role: role,
  });

  if (error) {
    redirect(withFlash(redirectTo, "error", error.message));
  }

  redirect(withFlash(redirectTo, "message", "Member role updated."));
}

export async function removeMemberAction(formData: FormData) {
  const membershipId = String(formData.get("membershipId") || "").trim();
  const redirectTo = resolveRedirectTarget(formData, "/settings/organization");

  const { supabase } = await requireAuthenticatedUser();
  const { error } = await supabase.rpc("remove_organization_member", {
    p_membership_id: membershipId,
  });

  if (error) {
    redirect(withFlash(redirectTo, "error", error.message));
  }

  redirect(withFlash(redirectTo, "message", "Member removed."));
}

export async function startCheckoutAction(formData: FormData) {
  const organizationId = String(formData.get("organizationId") || "").trim();
  const requestedPlan = String(formData.get("planKey") || "").trim();
  const redirectTo = resolveRedirectTarget(formData, "/settings/billing");

  if (!isPlanKey(requestedPlan) || requestedPlan === "free") {
    redirect(withFlash(redirectTo, "error", "Select a valid paid plan."));
  }

  if (!stripeIsConfigured()) {
    redirect(withFlash(redirectTo, "error", "Stripe is not configured. Set STRIPE_SECRET_KEY to enable checkout."));
  }

  const planKey = requestedPlan as PlanKey;
  const { supabase, user } = await requireOrganizationOwner(organizationId);
  const [organizationResponse, subscription] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name")
      .eq("id", organizationId)
      .maybeSingle<{ id: string; name: string }>(),
    getOrganizationSubscription(supabase, organizationId),
  ]);

  if (organizationResponse.error || !organizationResponse.data) {
    redirect(withFlash(redirectTo, "error", "Unable to load the selected organization."));
  }

  const stripe = createStripeServerClient();
  let customerId = subscription.provider_customer_id;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: organizationResponse.data.name,
      metadata: {
        organization_id: organizationId,
      },
    });

    customerId = customer.id;
    await updateOrganizationCustomerId(organizationId, customerId);
  }

  const lookupKey = getStripeLookupKeyForPlan(planKey);

  if (!lookupKey) {
    redirect(withFlash(redirectTo, "error", "The selected plan does not have a checkout configuration."));
  }

  const prices = await stripe.prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
  });

  if (!prices.data[0]) {
    redirect(
      withFlash(
        redirectTo,
        "error",
        `No active Stripe price was found for lookup key "${lookupKey}". Create that price in Stripe before using checkout.`
      )
    );
  }

  const origin = (await headers()).get("origin") || process.env.APP_URL || "http://localhost:3000";
  await recordOrganizationActivity(supabase, {
    organizationId,
    action: "billing.checkout_started",
    entityType: "subscription",
    metadata: {
      requested_plan_key: planKey,
      current_plan_key: subscription.plan_key,
      stripe_lookup_key: lookupKey,
    },
  });

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    success_url: `${origin}${withFlash(redirectTo, "message", "Billing updated successfully.")}`,
    cancel_url: `${origin}${withFlash(redirectTo, "message", "Checkout canceled.")}`,
    line_items: [
      {
        price: prices.data[0].id,
        quantity: 1,
      },
    ],
    metadata: {
      organization_id: organizationId,
      plan_key: planKey,
    },
    subscription_data: {
      metadata: {
        organization_id: organizationId,
        plan_key: planKey,
      },
    },
    client_reference_id: organizationId,
    allow_promotion_codes: true,
  });

  if (!session.url) {
    redirect(withFlash(redirectTo, "error", "Stripe checkout did not return a redirect URL."));
  }

  redirect(session.url);
}

export async function openBillingPortalAction(formData: FormData) {
  const organizationId = String(formData.get("organizationId") || "").trim();
  const redirectTo = resolveRedirectTarget(formData, "/settings/billing");

  if (!stripeIsConfigured()) {
    redirect(
      withFlash(redirectTo, "error", "Stripe is not configured. Set STRIPE_SECRET_KEY to enable billing portal.")
    );
  }

  const { supabase } = await requireOrganizationOwner(organizationId);
  const subscription = await getOrganizationSubscription(supabase, organizationId);

  if (!subscription.provider_customer_id) {
    redirect(withFlash(redirectTo, "error", "No Stripe customer exists for this organization yet."));
  }

  const stripe = createStripeServerClient();
  const origin = (await headers()).get("origin") || process.env.APP_URL || "http://localhost:3000";
  await recordOrganizationActivity(supabase, {
    organizationId,
    action: "billing.portal_opened",
    entityType: "subscription",
    metadata: {
      customer_id: subscription.provider_customer_id,
    },
  });
  const session = await stripe.billingPortal.sessions.create({
    customer: subscription.provider_customer_id,
    return_url: `${origin}${redirectTo}`,
  });

  redirect(session.url);
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/auth?message=Signed%20out.");
}
