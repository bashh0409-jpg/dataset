import { z } from "zod";

export const PRO_AI_REQUEST_LIMIT = 50;

const workspaceProAiUsageRowsSchema = z
  .array(
    z.object({
      used: z.number().int().min(0).max(PRO_AI_REQUEST_LIMIT),
      next_available_at: z.string().nullable(),
      credit_balance: z.number().int().nonnegative(),
    }),
  )
  .length(1);

export type WorkspaceProAiUsage = {
  used: number;
  requestLimit: number;
  remaining: number;
  nextAvailableAt: string | null;
  creditBalance: number;
};

export function parseWorkspaceProAiUsage(
  input: unknown,
):
  | { data: WorkspaceProAiUsage }
  | { error: "invalid_response" | "invalid_reset_time" } {
  const parsed = workspaceProAiUsageRowsSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_response" };

  const row = parsed.data[0];
  if (
    row.next_available_at &&
    !Number.isFinite(Date.parse(row.next_available_at))
  ) {
    return { error: "invalid_reset_time" };
  }

  return {
    data: {
      used: row.used,
      requestLimit: PRO_AI_REQUEST_LIMIT,
      remaining: Math.max(0, PRO_AI_REQUEST_LIMIT - row.used),
      nextAvailableAt: row.next_available_at,
      creditBalance: row.credit_balance,
    },
  };
}
