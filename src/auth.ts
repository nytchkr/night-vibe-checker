import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { v5 as uuidv5 } from "uuid";

const USER_NAMESPACE = "2ad91bd0-3512-45fb-8f71-719e4c45a2df";

async function upsertProfile(profile: {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
}) {
  const { sql } = await import("@/lib/db");

  await sql`
    insert into profiles (id, email, display_name, avatar_url)
    values (${profile.id}, ${profile.email ?? null}, ${profile.name ?? null}, ${profile.image ?? null})
    on conflict (id) do update set
      email = excluded.email,
      display_name = coalesce(excluded.display_name, profiles.display_name),
      avatar_url = coalesce(excluded.avatar_url, profiles.avatar_url)
  `;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        const googleId = profile.sub;
        const userId = googleId ? uuidv5(`google:${googleId}`, USER_NAMESPACE) : token.sub;

        if (userId) token.sub = userId;
        token.googleId = googleId == null ? undefined : googleId;
        token.email = profile.email == null ? undefined : profile.email;
        token.name = profile.name == null ? undefined : profile.name;
        token.picture = typeof profile.picture === "string" ? profile.picture : undefined;

        if (userId) {
          await upsertProfile({
            id: userId,
            email: profile.email,
            name: profile.name,
            image: profile.picture,
          });
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      if (url.startsWith(baseUrl)) return url;
      return `${baseUrl}/explore`;
    },
  },
  pages: {
    signIn: "/sign-in",
  },
});
