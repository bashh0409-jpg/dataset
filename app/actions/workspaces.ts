"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const workspaceIdSchema = z.uuid();
const workspaceMembersSchema = z.array(
  z.object({
    member_id: z.uuid(),
    member_name: z.string().nullable(),
    member_email: z.string().nullable(),
    member_role: z.enum(["owner", "member"]),
    member_joined_at: z.iso.datetime({ offset: true }),
  }),
);

export type WorkspaceMember = {
  id: string;
  name: string | null;
  email: string | null;
  role: "owner" | "member";
  joinedAt: string;
};

type MembersResult =
  | { data: WorkspaceMember[] }
  | { error: string };

export async function getWorkspaceMembers(
  workspaceId: unknown,
): Promise<MembersResult> {
  const parsedId = workspaceIdSchema.safeParse(workspaceId);
  if (!parsedId.success) {
    return { error: "Workspace not found." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Please sign in again to view workspace members." };
  }

  const { data, error } = await supabase.rpc("get_workspace_members", {
    p_workspace_id: parsedId.data,
  });

  if (error) {
    return { error: "Unable to load workspace members. Please try again." };
  }

  const parsedMembers = workspaceMembersSchema.safeParse(data);
  if (!parsedMembers.success) {
    return { error: "Workspace members returned an unexpected response." };
  }

  return {
    data: parsedMembers.data.map((member) => ({
      id: member.member_id,
      name: member.member_name,
      email: member.member_email,
      role: member.member_role,
      joinedAt: member.member_joined_at,
    })),
  };
}
