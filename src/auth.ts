import NextAuth, { DefaultSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { SignJWT } from "jose";
import { supabase } from "@/integrations/supabase/client";

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

async function generateSupabaseToken(userId: string, email: string) {
  const secretStr = process.env.SUPABASE_JWT_SECRET;
  if (!secretStr) {
    throw new Error("Missing SUPABASE_JWT_SECRET env variable");
  }
  const secret = new TextEncoder().encode(secretStr);
  return await new SignJWT({
    aud: "authenticated",
    role: "authenticated",
    email: email,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("1d")
    .sign(secret);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
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
    async jwt({ token, user, account }) {
      if (user && account && account.provider === "google") {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const email = user.email!;

          // 1. Try to find user ID by checking profiles (exposed via public schema)
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("email", email)
            .maybeSingle();

          let userId = profile?.id;

          // 2. If profile is missing, fallback to check auth.users directly via listUsers admin API
          if (!userId) {
            const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
            const existingUser = listData?.users?.find((u) => u.email === email);
            userId = existingUser?.id;
          }

          // 3. If user doesn't exist, create them in Supabase auth
          if (!userId) {
            const { data: userData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
              email: email,
              email_confirm: true,
              user_metadata: {
                full_name: user.name || "",
              },
            });

            if (createErr || !userData.user) {
              throw new Error(createErr?.message || "Failed to create Supabase user for Google sign in");
            }
            userId = userData.user.id;
          } else {
            // Self-healing check: Ensure the user has a profile and default role in the public schema
            const { data: profileCheck } = await supabaseAdmin
              .from("profiles")
              .select("id")
              .eq("id", userId)
              .maybeSingle();

            if (!profileCheck) {
              await supabaseAdmin.from("profiles").insert({
                id: userId,
                email: email,
                full_name: user.name || "",
              });
            }

            const { data: rolesCheck } = await supabaseAdmin
              .from("user_roles")
              .select("role")
              .eq("user_id", userId);

            if (!rolesCheck || rolesCheck.length === 0) {
              await supabaseAdmin.from("user_roles").insert({
                user_id: userId,
                role: "customer",
              });
            }
          }

          // Fetch user roles
          const { data: rolesData } = await supabaseAdmin
            .from("user_roles")
            .select("role")
            .eq("user_id", userId);

          const roles = (rolesData || []).map((r) => r.role);

          // Generate custom Supabase RLS JWT
          const supabaseToken = await generateSupabaseToken(userId, email);

          token.id = userId;
          token.roles = roles;
          token.accessToken = supabaseToken;
        } catch (err) {
          console.error("Error in Google OAuth jwt callback:", err);
          throw err;
        }
      } else if (user) {
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
    error: "/auth/error",
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
});
