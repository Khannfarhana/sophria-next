import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { supabase } from "@/integrations/supabase/client";

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
        } catch (err: any) {
          throw new Error(err.message || "Failed to authorize");
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.roles = (user as any).roles || [];
        token.accessToken = (user as any).accessToken;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).roles = token.roles || [];
        (session.user as any).accessToken = token.accessToken;
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
  secret: process.env.NEXTAUTH_SECRET,
});
