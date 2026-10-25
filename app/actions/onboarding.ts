"use server";

import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const onboardingSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  workspaceName: z.string().trim().min(1).max(80),
});

const invitationSchema = z.object({
  workspaceId: z.uuid(),
  email: z.email().trim().max(254),
});

type ActionResult<T> = { data: T } | { error: string };

export async function createOnboardingWorkspace(
  input: unknown,
): Promise<ActionResult<{ workspaceId: string }>> {
  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Enter your name and a workspace name (up to 80 characters)." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Please sign in again to create your workspace." };
  }

  const { data, error } = await supabase.rpc("create_workspace_with_owner", {
    p_display_name: parsed.data.displayName,
    p_workspace_name: parsed.data.workspaceName,
  });

  if (error) {
    return { error: "We couldn't create your workspace. Please try again." };
  }

  if (typeof data !== "string") {
    return { error: "Workspace creation returned an unexpected result." };
  }

  return { data: { workspaceId: data } };
}

export async function createWorkspaceInvite(
  input: unknown,
): Promise<ActionResult<{ token: string }>> {
  const parsed = invitationSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Enter a valid email address." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Please sign in again to invite a teammate." };
  }

  if (user.email?.toLowerCase() === parsed.data.email.toLowerCase()) {
    return { error: "You can't invite your own email address." };
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { error } = await supabase.from("workspace_invites").insert({
    workspace_id: parsed.data.workspaceId,
    email: parsed.data.email,
    token_hash: tokenHash,
    invited_by: user.id,
  });

  if (error) {
    return {
      error:
        error.code === "23505"
          ? "There's already a pending invite for that email."
          : "We couldn't create the invite. Please try again.",
    };
  }

  return { data: { token } };
}

export async function acceptWorkspaceInvite(
  token: string,
): Promise<ActionResult<{ workspaceId: string }>> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) {
    return { error: "This invitation link is invalid or has expired." };
  }

  const {
    data,
    error,
  } = await (await createSupabaseServerClient()).rpc(
    "accept_workspace_invite",
    {
      p_token_hash: createHash("sha256").update(token).digest("hex"),
    },
  );

  if (error || typeof data !== "string") {
    return {
      error:
        "This invitation is invalid, expired, already used, or belongs to a different email address.",
    };
  }

  return { data: { workspaceId: data } };
}
