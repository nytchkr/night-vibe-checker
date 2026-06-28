import { sql } from "@/lib/db";

export async function isProUser(userId: string): Promise<boolean> {
  const [user] = await sql`
    SELECT subscription_status
    FROM users
    WHERE id = ${userId}
    LIMIT 1
  `;

  return user?.subscription_status === "active";
}
