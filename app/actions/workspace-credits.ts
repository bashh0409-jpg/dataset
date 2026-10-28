"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const workspaceIdSchema = z.uuid();
const workspaceCreditSchema = z.array(
  z.object({
    workspace_id: z.uuid(),
    credit_balance: z.number().int().nonnegative(),
  }),
);

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

  const { data, error } = await supabase.rpc("get_workspace_pro_access", {
    p_workspace_ids: [parsedWorkspaceId.data],
  });

  if (error) {
    return {
      error:
        "Unable to load workspace credits. Apply the workspace Pro access migration, then try again.",
    };
  }

  const parsedCredits = workspaceCreditSchema.safeParse(data);
  if (!parsedCredits.success) {
    return { error: "Workspace credits returned an unexpected response." };
  }

  const workspaceCredit = parsedCredits.data.find(
    (credit) => credit.workspace_id === parsedWorkspaceId.data,
  );
  if (!workspaceCredit) {
    return { error: "You don't have access to this workspace." };
  }

  return { data: { balance: workspaceCredit.credit_balance } };
}
