import NextAuth, { DefaultSession, User } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { supabase } from "@/integrations/supabase/client";

const authSecret =
  process.env.NEXTAUTH_SECRET ||
  (process.env.NODE_ENV === "development"
    ? "dev-only-nextauth-secret-change-me"
    : undefined);

if (!process.env.NEXTAUTH_SECRET && process.env.NODE_ENV === "development") {
  console.warn(
    "[Auth] NEXTAUTH_SECRET is not set. Using a development fallback. Set NEXTAUTH_SECRET in .env.local for stable sessions."
  );
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      roles: string[];
      accessToken?: string;
    } & DefaultSession["user"];
  }

  interface User {
    id?: string;
    roles?: string[];
    accessToken?: string;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          const { data, error } = await supabase.auth.signInWithPassword({
            email: credentials.email as string,
            password: credentials.password as string,
          });

          if (error || !data.user || !data.session) {
            throw new Error(error?.message || "Invalid credentials");
          }

          // Fetch user roles
          const { data: rolesData } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", data.user.id);

          const roles = (rolesData || []).map((r) => r.role);

          return {
            id: data.user.id,
            email: data.user.email,
            name: data.user.user_metadata?.full_name || "",
            accessToken: data.session.access_token,
            roles: roles,
          };
        } catch (err: unknown) {
          if (err instanceof Error) {
            throw new Error(err.message || "Failed to authorize");
          }
          throw new Error("Failed to authorize");
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.roles = user.roles || [];
        token.accessToken = user.accessToken;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.roles = (token.roles as string[]) || [];
        session.user.accessToken = token.accessToken as string | undefined;
      }
      return session;
    }
  },
  pages: {
    signIn: "/auth",
  },
  session: {
    strategy: "jwt",
  },
  secret: authSecret,
});

