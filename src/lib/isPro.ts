import { supabaseAdmin } from "@/lib/supabase";

export async function isProUser(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("users")
    .select("subscription_status")
    .eq("id", userId)
    .single();

  return data?.subscription_status === "active";
}
