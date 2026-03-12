import { redirect } from "next/navigation";
import { buildEntitlementSummary, filterByHistoryWindow, getOrganizationSubscription } from "@/lib/billing/server";
import { getActiveOrganizationContext } from "@/lib/organizations/active";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
};

export type OrganizationMember = {
  membership_id: string;
  user_id: string;
  email: string | null;
  role: string;
  status: string;
  created_at: string;
};

export type OrganizationInvite = {
  invite_id: string;
  organization_id: string;
  email: string;
  role: string;
  token: string;
  status: string;
  delivery_status: string;
  delivery_error: string | null;
  expires_at: string;
  accepted_at: string | null;
  last_sent_at: string | null;
  created_at: string;
};

export type BillingSnapshot = {
  organization_id: string;
  plan_key: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
};

export type ActivityLog = {
  id: number;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export function asPending(invite: OrganizationInvite) {
  return invite.status === "pending" && new Date(invite.expires_at) >= new Date();
}

export function historyLabel(invite: OrganizationInvite) {
  if (invite.status === "pending" && new Date(invite.expires_at) < new Date()) {
    return "expired";
  }

  return invite.status;
}

export function activityLabel(action: string) {
  return action
    .split(".")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function activitySummary(activity: ActivityLog) {
  const metadata = activity.metadata ?? {};

  if (typeof metadata.email === "string") {
    return metadata.email;
  }

  if (typeof metadata.requested_plan_key === "string") {
    return `Plan ${metadata.requested_plan_key}`;
  }

  if (typeof metadata.new_plan_key === "string") {
    return `Plan ${metadata.new_plan_key}`;
  }

  if (typeof metadata.new_status === "string") {
    return `Status ${metadata.new_status}`;
  }

  return activity.entity_type;
}

export async function requireWorkspaceShellContext() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const [{ data: profile }, activeContext] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name").eq("id", user.id).maybeSingle<Profile>(),
    getActiveOrganizationContext(supabase, user.id),
  ]);

  return {
    supabase,
    user,
    profile,
    ...activeContext,
  };
}

export async function getActiveWorkspaceDetails(input: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  activeOrganizationId: string | null;
  activeRole: string | null;
}) {
  const { supabase, activeOrganizationId, activeRole } = input;
  const canViewBilling = activeRole === "owner" || activeRole === "admin";
  const canManageBilling = activeRole === "owner";

  if (!activeOrganizationId) {
    return {
      canViewBilling,
      canManageBilling,
      members: [] as OrganizationMember[],
      invites: [] as OrganizationInvite[],
      pendingInvites: [] as OrganizationInvite[],
      inviteHistory: [] as OrganizationInvite[],
      billing: null as BillingSnapshot | null,
      billingSummary: null,
      activityLogs: [] as ActivityLog[],
      visibleActivityLogs: [] as ActivityLog[],
    };
  }

  const [{ data: memberRows }, { data: inviteRows }, subscription, { data: activityRows }] = await Promise.all([
    supabase
      .rpc("get_organization_members", {
        p_organization_id: activeOrganizationId,
      })
      .returns<OrganizationMember[]>(),
    activeRole === "owner"
      ? supabase
          .rpc("get_organization_invite_history", {
            p_organization_id: activeOrganizationId,
          })
          .returns<OrganizationInvite[]>()
      : Promise.resolve({ data: [] as OrganizationInvite[], error: null }),
    canViewBilling ? getOrganizationSubscription(supabase, activeOrganizationId) : Promise.resolve(null),
    supabase
      .from("activity_logs")
      .select("id, action, entity_type, entity_id, metadata, created_at")
      .eq("organization_id", activeOrganizationId)
      .order("created_at", { ascending: false })
      .limit(20)
      .returns<ActivityLog[]>(),
  ]);

  const members = Array.isArray(memberRows) ? memberRows : [];
  const invites = Array.isArray(inviteRows) ? inviteRows : [];
  const billing = subscription;
  const pendingInvites = invites.filter(asPending);
  const billingSummary = billing
    ? buildEntitlementSummary(billing, {
        memberCount: members.length,
        pendingInviteCount: pendingInvites.length,
        seatsUsed: members.length + pendingInvites.length,
      })
    : null;
  const inviteHistory = filterByHistoryWindow(
    invites.filter((invite) => !asPending(invite)),
    billingSummary?.historyWindowDays ?? 30
  );
  const activityLogs = Array.isArray(activityRows) ? activityRows : [];
  const visibleActivityLogs = filterByHistoryWindow(activityLogs, billingSummary?.historyWindowDays ?? 30);

  return {
    canViewBilling,
    canManageBilling,
    members,
    invites,
    pendingInvites,
    inviteHistory,
    billing,
    billingSummary,
    activityLogs,
    visibleActivityLogs,
  };
}
