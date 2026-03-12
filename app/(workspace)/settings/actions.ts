"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

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
    redirect("/settings/organization?error=Only%20organization%20owners%20can%20update%20workspace%20settings.");
  }

  return { supabase, user };
}

export async function updateProfileAction(formData: FormData) {
  const fullName = String(formData.get("fullName") || "").trim();
  const { supabase, user } = await requireAuthenticatedUser();
  const { error } = await supabase.from("profiles").update({ full_name: fullName || null }).eq("id", user.id);

  if (error) {
    redirect(`/settings/profile?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/settings/profile?message=Profile%20updated.");
}

export async function updateOrganizationDetailsAction(formData: FormData) {
  const organizationId = String(formData.get("organizationId") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const rawSlug = String(formData.get("slug") || "").trim();

  if (!name) {
    redirect("/settings/organization?error=Organization%20name%20is%20required.");
  }

  const { supabase } = await requireOrganizationOwner(organizationId);
  const slug = slugify(rawSlug || name);
  const { error } = await supabase
    .from("organizations")
    .update({
      name,
      slug,
    })
    .eq("id", organizationId);

  if (error) {
    redirect(`/settings/organization?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/settings/organization?message=Organization%20settings%20updated.");
}
