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

const invitedOnboardingSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  token: z.string().regex(/^[A-Za-z0-9_-]{40,60}$/),
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

export async function completeInvitedUserOnboarding(
  input: unknown,
): Promise<ActionResult<{ workspaceId: string }>> {
  const parsed = invitedOnboardingSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Enter your name to continue." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Please sign in again to accept your invitation." };
  }

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      display_name: parsed.data.displayName,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (profileError) {
    return { error: "We couldn't save your profile. Please try again." };
  }

  const tokenHash = createHash("sha256")
    .update(parsed.data.token)
    .digest("hex");
  const { data, error } = await supabase.rpc("accept_workspace_invite", {
    p_token_hash: tokenHash,
  });

  if (error || typeof data !== "string") {
    return {
      error:
        "This invitation is invalid, expired, already used, or belongs to a different email address.",
    };
  }

  return { data: { workspaceId: data } };
}

export async function createWorkspaceInvite(
  input: unknown,
): Promise<ActionResult<{ email: string }>> {
  const parsed = invitationSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Enter a valid email address." };
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const senderEmail = process.env.RESEND_FROM_EMAIL;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  if (!resendApiKey || !senderEmail || !siteUrl) {
    return {
      error:
        "Email invitations aren't configured. Set RESEND_API_KEY, RESEND_FROM_EMAIL, and NEXT_PUBLIC_SITE_URL.",
    };
  }

  let appUrl: URL;
  try {
    appUrl = new URL(siteUrl);
    if (
      (appUrl.protocol !== "https:" && appUrl.protocol !== "http:") ||
      appUrl.username ||
      appUrl.password
    ) {
      throw new Error("Invalid app URL");
    }
  } catch {
    return { error: "NEXT_PUBLIC_SITE_URL must be a valid HTTP or HTTPS URL." };
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

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("name")
    .eq("id", parsed.data.workspaceId)
    .single();

  if (workspaceError) {
    return { error: "Unable to load this workspace. Check your access and try again." };
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

  const inviteUrl = new URL(
    `/invite/${encodeURIComponent(token)}`,
    appUrl,
  ).toString();

  const escapeHtml = (value: string) =>
    value.replace(/[&<>"']/g, (character) => {
      const entities: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      return entities[character];
    });
  const safeWorkspaceName = escapeHtml(workspace.name);
  const safeInviteUrl = escapeHtml(inviteUrl);
  const safeInviterName =
    typeof user.user_metadata.full_name === "string"
      ? user.user_metadata.full_name
      : typeof user.user_metadata.name === "string"
        ? user.user_metadata.name
        : user.email ?? "A teammate";
  const safeSenderName = escapeHtml(safeInviterName);

  let emailResponse: Response;
  try {
    emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: senderEmail,
        to: [parsed.data.email],
        subject: `You're invited to join ${workspace.name}`,
        text: `${safeInviterName} invited you to join ${workspace.name} on Synthetic. Accept your invitation within 7 days: ${inviteUrl}`,
        html: `<main style="max-width:560px;margin:40px auto;padding:32px;font-family:Arial,sans-serif;color:#101828"><p style="color:#3282ff;font-size:13px;font-weight:600">SYNTHETIC</p><h1 style="font-size:24px;letter-spacing:-0.5px">You're invited</h1><p style="color:#475467;line-height:1.6"><strong>${safeSenderName}</strong> invited you to join <strong>${safeWorkspaceName}</strong> on Synthetic.</p><p style="margin:28px 0"><a href="${safeInviteUrl}" style="display:inline-block;padding:12px 18px;border-radius:7px;background:#3282ff;color:white;text-decoration:none;font-weight:600">Accept invitation</a></p><p style="color:#667085;font-size:13px;line-height:1.6">This link is single-use, expires in 7 days, and only works for the email address this invitation was sent to.</p></main>`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return {
      error:
        "The invite was created, but the email could not be sent. Check your email configuration and try again.",
    };
  }

  if (!emailResponse.ok) {
    return {
      error:
        "The invite was created, but the email provider couldn't send it. Check your Resend sender configuration and try again.",
    };
  }

  return { data: { email: parsed.data.email } };
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
