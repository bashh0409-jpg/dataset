"use server";

import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const apiKeyNameSchema = z.string().trim().min(1).max(80);

type CreateApiKeyResult =
  | {
      data: {
        id: string;
        name: string;
        prefix: string;
        createdAt: string;
        key: string;
      };
    }
  | { error: string };

export async function createApiKey(input: unknown): Promise<CreateApiKeyResult> {
  const parsedName = apiKeyNameSchema.safeParse(input);
  if (!parsedName.success) {
    return { error: "Enter a key name between 1 and 80 characters." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Please sign in again to create an API key." };
  }

  const key = `syn_${randomBytes(32).toString("base64url")}`;
  const keyHash = createHash("sha256").update(key).digest("hex");
  const keyPrefix = key.slice(0, 12);
  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      user_id: user.id,
      name: parsedName.data,
      key_prefix: keyPrefix,
      key_hash: keyHash,
    })
    .select("id, name, key_prefix, created_at")
    .single();

  if (error) {
    return { error: "Unable to create your API key. Please try again." };
  }

  return {
    data: {
      id: data.id,
      name: data.name,
      prefix: data.key_prefix,
      createdAt: data.created_at,
      key,
    },
  };
}
