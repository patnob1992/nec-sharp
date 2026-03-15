/**
 * Crew system — groups of 10-20 members.
 * Invite via code. No chat/messaging.
 */

import { supabase } from "./supabase";

const MAX_MEMBERS = 20;
const MIN_MEMBERS = 10;

export type Crew = {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
  created_at: string;
  max_members: number;
};

export type CrewMember = {
  id: string;
  crew_id: string;
  user_id: string;
  joined_at: string;
};

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** Create a new crew. Creator is first member. */
export async function createCrew(userId: string, name: string): Promise<{ crew: Crew; inviteCode: string } | null> {
  const inviteCode = generateInviteCode();

  const { data: crew, error: crewError } = await supabase
    .from("crew")
    .insert({
      name,
      invite_code: inviteCode,
      created_by: userId,
      max_members: MAX_MEMBERS,
    })
    .select()
    .single();

  if (crewError || !crew) return null;

  const { error: memberError } = await supabase.from("crew_members").insert({
    crew_id: crew.id,
    user_id: userId,
  });

  if (memberError) {
    await supabase.from("crew").delete().eq("id", crew.id);
    return null;
  }

  return { crew: crew as Crew, inviteCode };
}

/** Join crew by crew ID. */
export async function joinCrewById(userId: string, crewId: string): Promise<{ success: boolean; error?: string }> {
  const { data: crew } = await supabase.from("crew").select("id, max_members").eq("id", crewId).single();
  if (!crew) return { success: false, error: "Crew not found" };

  const { count } = await supabase
    .from("crew_members")
    .select("id", { count: "exact", head: true })
    .eq("crew_id", crew.id);
  if ((count ?? 0) >= crew.max_members) return { success: false, error: "Crew is full" };

  const { error } = await supabase.from("crew_members").insert({ crew_id: crew.id, user_id: userId });
  if (error) {
    if (error.code === "23505") return { success: false, error: "Already a member" };
    return { success: false, error: error.message };
  }
  return { success: true };
}

/** Join crew via invite code */
export async function joinCrew(userId: string, inviteCode: string): Promise<{ success: boolean; error?: string }> {
  const code = inviteCode.trim().toUpperCase();
  if (!code || code.length !== 6) return { success: false, error: "Invalid code" };

  const { data: crew } = await supabase.from("crew").select("id, max_members").eq("invite_code", code).single();
  if (!crew) return { success: false, error: "Crew not found" };

  const { count } = await supabase
    .from("crew_members")
    .select("id", { count: "exact", head: true })
    .eq("crew_id", crew.id);

  if ((count ?? 0) >= crew.max_members) return { success: false, error: "Crew is full" };

  const { error } = await supabase.from("crew_members").insert({
    crew_id: crew.id,
    user_id: userId,
  });

  if (error) {
    if (error.code === "23505") return { success: false, error: "Already a member" };
    return { success: false, error: error.message };
  }

  return { success: true };
}

/** Get crew for current user (first crew joined). */
export async function getMyCrew(userId: string): Promise<Crew | null> {
  const { data: member } = await supabase
    .from("crew_members")
    .select("crew_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (!member) return null;

  const { data: crew } = await supabase.from("crew").select("*").eq("id", member.crew_id).single();
  return crew as Crew | null;
}

/** List crews the user is a member of (RLS-filtered via crew_members). */
export async function listMyCrews(userId: string): Promise<Crew[]> {
  const { data: members } = await supabase
    .from("crew_members")
    .select("crew_id")
    .eq("user_id", userId);
  const crewIds = (members ?? []).map((m) => m.crew_id).filter(Boolean);
  if (crewIds.length === 0) return [];
  const { data: crews } = await supabase.from("crew").select("*").in("id", crewIds);
  return (crews ?? []) as Crew[];
}

/** Leave a crew. Deletes own crew_members row. */
export async function leaveCrew(userId: string, crewId: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from("crew_members")
    .delete()
    .eq("crew_id", crewId)
    .eq("user_id", userId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Crew leaderboard. Returns empty until user_stats has weekly columns or weekly_stats exists. */
export async function fetchCrewLeaderboard(
  userId: string
): Promise<{ entries: Array<{ rank: number; user_id: string; performance_score: number }>; userPosition: number | null }> {
  const crew = await getMyCrew(userId);
  if (!crew) return { entries: [], userPosition: null };
  return { entries: [], userPosition: null };
}
