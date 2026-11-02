"use server";

import { z } from "zod";
import { encryptProviderKey } from "@/lib/ai/provider-credentials";
import {
  parseWorkspaceProAiUsage,
  PRO_AI_REQUEST_LIMIT,
} from "@/lib/ai/pro-usage";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const providerSchema = z.enum(["anthropic", "openai"]);
const apiKeyInputSchema = z.string().trim().min(20).max(500);
const workspaceIdSchema = z.uuid();

type ProSettingsResult =
  | {
      data: {
        isPro: boolean;
        status: string | null;
        currentPeriodEnd: string | null;
        requestsUsed: number;
        requestLimit: number;
        requestsRemaining: number;
        nextAvailableAt: string | null;
        savedProviders: ("anthropic" | "openai")[];
      };
    }
  | { error: string };

async function getCurrentUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;
  return { supabase, user };
}

export async function getProAiSettings(
  workspaceIdInput: unknown,
): Promise<ProSettingsResult> {
  const auth = await getCurrentUser();
  if (!auth) return { error: "Please sign in again to view your AI plan." };

  const workspaceId = workspaceIdSchema.safeParse(workspaceIdInput);
  if (!workspaceId.success) {
    return { error: "Select a valid workspace to view Pro AI usage." };
  }

  const { data: subscription, error: subscriptionError } = await auth.supabase
    .from("plan_subscriptions")
    .select("status, current_period_end")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (subscriptionError) {
    return { error: "Unable to load your Pro plan. Please try again." };
  }

  const isPro =
    (subscription?.status === "active" || subscription?.status === "trialing") &&
    Date.parse(subscription.current_period_end) > Date.now();
  const { data: usageData, error: usageError } = await auth.supabase.rpc(
    "get_workspace_pro_ai_usage",
    { p_workspace_id: workspaceId.data },
  );
  if (usageError) {
    return { error: "Unable to load your Pro AI usage. Please try again." };
  }
  const usage = parseWorkspaceProAiUsage(usageData);
  if ("error" in usage) {
    return {
      error:
        usage.error === "invalid_reset_time"
          ? "Pro AI usage returned an invalid reset time."
          : "Pro AI usage returned an invalid response.",
    };
  }

  const { data: credentials, error: credentialsError } = await auth.supabase
    .from("ai_provider_credentials")
    .select("provider")
    .eq("user_id", auth.user.id);

  if (credentialsError) {
    return { error: "Unable to load your saved AI providers. Please try again." };
  }

  return {
    data: {
      isPro,
      status: subscription?.status ?? null,
      currentPeriodEnd: subscription?.current_period_end ?? null,
      requestsUsed: usage.data.used,
      requestLimit: PRO_AI_REQUEST_LIMIT,
      requestsRemaining: usage.data.remaining,
      nextAvailableAt: usage.data.nextAvailableAt,
      savedProviders: credentials.map((credential) =>
        providerSchema.parse(credential.provider),
      ),
    },
  };
}

export async function getWorkspaceProAiUsage(
  workspaceIdInput: unknown,
): Promise<
  | {
      data: {
        used: number;
        requestLimit: number;
        remaining: number;
        nextAvailableAt: string | null;
        creditBalance: number;
      };
    }
  | { error: string }
> {
  const workspaceId = workspaceIdSchema.safeParse(workspaceIdInput);
  if (!workspaceId.success) {
    return { error: "Select a valid workspace to view Pro AI usage." };
  }

  const auth = await getCurrentUser();
  if (!auth) return { error: "Please sign in again to view Pro AI usage." };

  const { data, error } = await auth.supabase.rpc(
    "get_workspace_pro_ai_usage",
    { p_workspace_id: workspaceId.data },
  );
  if (error) {
    return { error: "Unable to load workspace Pro AI usage. Please try again." };
  }

  const usage = parseWorkspaceProAiUsage(data);
  if ("error" in usage) {
    return {
      error:
        usage.error === "invalid_reset_time"
          ? "Workspace Pro AI usage returned an invalid reset time."
          : "Workspace Pro AI usage returned an invalid response.",
    };
  }

  return {
    data: {
      used: usage.data.used,
      requestLimit: usage.data.requestLimit,
      remaining: usage.data.remaining,
      nextAvailableAt: usage.data.nextAvailableAt,
      creditBalance: usage.data.creditBalance,
    },
  };
}

export async function saveAiProviderKey(
  providerInput: unknown,
  keyInput: unknown,
): Promise<{ success: true } | { error: string }> {
  const provider = providerSchema.safeParse(providerInput);
  const apiKey = apiKeyInputSchema.safeParse(keyInput);
  if (!provider.success || !apiKey.success) {
    return { error: "Enter a valid Claude or OpenAI API key." };
  }

  const auth = await getCurrentUser();
  if (!auth) return { error: "Please sign in again to save an AI key." };

  const { data: subscription, error: subscriptionError } = await auth.supabase
    .from("plan_subscriptions")
    .select("status, current_period_end")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (subscriptionError) {
    return { error: "Unable to verify your Pro plan. Please try again." };
  }

  if (
    !subscription ||
    !["active", "trialing"].includes(subscription.status) ||
    Date.parse(subscription.current_period_end) <= Date.now()
  ) {
    return { error: "A current Pro subscription is required to save AI keys." };
  }

  let encryptedApiKey: string;
  try {
    encryptedApiKey = encryptProviderKey(apiKey.data);
  } catch {
    return {
      error:
        "Secure AI key storage is not configured. Contact the app administrator.",
    };
  }

  const { error } = await auth.supabase.from("ai_provider_credentials").upsert(
    {
      user_id: auth.user.id,
      provider: provider.data,
      encrypted_api_key: encryptedApiKey,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" },
  );

  if (error) {
    return { error: "Unable to save the AI key securely. Please try again." };
  }

  return { success: true };
}

export async function removeAiProviderKey(
  providerInput: unknown,
): Promise<{ success: true } | { error: string }> {
  const provider = providerSchema.safeParse(providerInput);
  if (!provider.success) return { error: "Choose a supported AI provider." };

  const auth = await getCurrentUser();
  if (!auth) return { error: "Please sign in again to remove an AI key." };

  const { error } = await auth.supabase
    .from("ai_provider_credentials")
    .delete()
    .eq("user_id", auth.user.id)
    .eq("provider", provider.data);

  if (error) {
    return { error: "Unable to remove the AI key. Please try again." };
  }

  return { success: true };
}
