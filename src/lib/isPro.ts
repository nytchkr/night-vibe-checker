import { sql } from "@/lib/db";

export async function isProUser(userId: string): Promise<boolean> {
  const rows = (await sql`
    SELECT subscription_status
    FROM users
    WHERE id = ${userId}
    LIMIT 1
  `) as Array<{ subscription_status?: string | null }>;
  const user = rows[0];

  return user?.subscription_status === "active";
}
