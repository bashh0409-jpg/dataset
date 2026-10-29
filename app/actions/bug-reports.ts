"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const diagnosticSchema = z
  .object({
    app: z.literal("Synthetic"),
    pagePath: z.string().max(512),
    userAgent: z.string().max(1000),
    viewport: z
      .object({
        width: z.number().int().min(0).max(10000),
        height: z.number().int().min(0).max(10000),
      })
      .strict(),
    language: z.string().max(100),
    timezone: z.string().max(100),
    collectedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

const attachmentPathSchema = z
  .string()
  .max(128)
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f-]{36}\.(png|jpg|webp|gif|webm|ogg|mp4|mpeg|wav)$/i,
  );

const bugReportSchema = z
  .object({
    description: z.string().trim().min(10).max(10000),
    attachmentPaths: z.array(attachmentPathSchema).max(6),
    diagnostics: diagnosticSchema.nullable(),
    turnstileToken: z.string().min(1).max(2048),
  })
  .strict();

const turnstileResponseSchema = z.object({
  success: z.boolean(),
  action: z.string().optional(),
});

export async function submitBugReport(
  input: unknown,
): Promise<{ success: true } | { error: string }> {
  const parsed = bugReportSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error:
        "Check the report description and attached files, then try again.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Please sign in again before sending a bug report." };
  }

  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
  if (!turnstileSecret) {
    console.error("Bug report Turnstile verification is not configured.");
    return {
      error:
        "Bug report verification is temporarily unavailable. Please try again later.",
    };
  }

  const verificationBody = new URLSearchParams({
    secret: turnstileSecret,
    response: parsed.data.turnstileToken,
  });
  let verificationResponse: Response;
  try {
    verificationResponse = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: verificationBody,
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      },
    );
  } catch (verificationError) {
    console.error(
      "Bug report Turnstile verification request failed.",
      verificationError,
    );
    return { error: "Unable to verify the security check. Please try again." };
  }

  let verificationResult: z.infer<typeof turnstileResponseSchema> | null = null;
  try {
    const parsedVerification = turnstileResponseSchema.safeParse(
      await verificationResponse.json(),
    );
    if (parsedVerification.success) {
      verificationResult = parsedVerification.data;
    }
  } catch {
    verificationResult = null;
  }

  if (
    !verificationResponse.ok ||
    !verificationResult?.success ||
    verificationResult.action !== "bug_report"
  ) {
    if (!verificationResponse.ok || !verificationResult) {
      console.error(
        "Bug report Turnstile verification returned an invalid response.",
        { status: verificationResponse.status },
      );
    }
    return {
      error:
        "The security check expired or could not be verified. Please complete it again.",
    };
  }

  if (
    parsed.data.attachmentPaths.some(
      (path) => !path.startsWith(`${user.id}/`),
    )
  ) {
    return { error: "One of the attachments is invalid. Please try again." };
  }

  const { error } = await supabase.from("bug_reports").insert({
    user_id: user.id,
    description: parsed.data.description,
    attachment_paths: parsed.data.attachmentPaths,
    diagnostics: parsed.data.diagnostics,
  });

  if (error) {
    if (error.code === "P0001") {
      return {
        error: "You've sent several reports recently. Please try again later.",
      };
    }
    return { error: "Unable to submit your bug report. Please try again." };
  }

  return { success: true };
}
