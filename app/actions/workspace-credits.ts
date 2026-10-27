"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const workspaceIdSchema = z.uuid();

export async function getWorkspaceCreditBalance(
  input: unknown,
): Promise<{ data: { balance: number } } | { error: string }> {
  const parsedWorkspaceId = workspaceIdSchema.safeParse(input);
  if (!parsedWorkspaceId.success) {
    return { error: "Select a valid workspace to view its credits." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Please sign in again to view workspace credits." };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", parsedWorkspaceId.data)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) {
    return { error: "Unable to verify workspace access. Please try again." };
  }
  if (!membership) {
    return { error: "You don't have access to this workspace." };
  }

  const { data, error } = await supabase
    .from("workspace_credit_balances")
    .select("balance")
    .eq("workspace_id", parsedWorkspaceId.data)
    .maybeSingle();

  if (error) {
    return {
      error:
        "Unable to load workspace credits. Apply the workspace credits migration, then try again.",
    };
  }

  return { data: { balance: data?.balance ?? 0 } };
}
