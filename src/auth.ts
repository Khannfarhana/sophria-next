import NextAuth, { DefaultSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { SignJWT, jwtVerify } from "jose";
import { createClient } from "@supabase/supabase-js";

const authSecret =
  process.env.NEXTAUTH_SECRET ||
  (process.env.NODE_ENV === "development"
    ? "dev-only-nextauth-secret-change-me"
    : undefined);

if (!process.env.NEXTAUTH_SECRET && process.env.NODE_ENV === "development") {
  console.warn(
    "[Auth] NEXTAUTH_SECRET is not set. Using a development fallback. Set NEXTAUTH_SECRET in .env for stable sessions."
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

// --- Supabase RLS Token Utilities ---

const SUPABASE_TOKEN_TTL = "1d"; // Must match session.maxAge below

async function getSupabaseJwtSecret(): Promise<Uint8Array> {
  const secretStr = process.env.SUPABASE_JWT_SECRET;
  if (!secretStr) {
    throw new Error("Missing SUPABASE_JWT_SECRET env variable");
  }
  return new TextEncoder().encode(secretStr);
}

async function generateSupabaseToken(userId: string, email: string): Promise<string> {
  const secret = await getSupabaseJwtSecret();
  return await new SignJWT({
    aud: "authenticated",
    role: "authenticated",
    email: email,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(SUPABASE_TOKEN_TTL)
    .sign(secret);
}

/** Returns true if the token will expire within the next 5 minutes. */
async function isTokenExpiringSoon(token: string): Promise<boolean> {
  try {
    const secret = await getSupabaseJwtSecret();
    const { payload } = await jwtVerify(token, secret);
    if (!payload.exp) return true;
    const fiveMinutes = 5 * 60;
    return payload.exp - Math.floor(Date.now() / 1000) < fiveMinutes;
  } catch {
    // Verification failed (expired, bad signature, etc.) — treat as expired
    return true;
  }
}

// --- Non-persisting Supabase client for server-side credential verification ---

function createServerAuthClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        storage: undefined,
      },
    }
  );
}

// --- NextAuth Configuration ---

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: true,
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

        // C1: Use a dedicated non-persisting client for server-side auth
        const serverSupabase = createServerAuthClient();

        try {
          const { data, error } = await serverSupabase.auth.signInWithPassword({
            email: credentials.email as string,
            password: credentials.password as string,
          });

          if (error || !data.user || !data.session) {
            // R1: Preserve Supabase error codes for better debugging
            const message = error?.message || "Invalid credentials";
            const code = error?.code || "unknown";
            throw new Error(`${message} [${code}]`);
          }

          // Fetch user roles using the service-role client (bypasses RLS)
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: rolesData } = await supabaseAdmin
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
      // --- Initial sign-in: populate token from user/account ---
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

          // 2. Fallback to check auth.users directly via listUsers admin API (search first page of 1000 users)
          if (!userId) {
            const { data: listData } = await supabaseAdmin.auth.admin.listUsers({
              page: 1,
              perPage: 1000,
            });
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
        // Credentials provider — initial sign-in
        token.id = user.id;
        token.roles = user.roles || [];
        token.accessToken = user.accessToken;
      }

      // --- C3: Token refresh on subsequent requests ---
      // Check if the stored Supabase access token is expiring soon and regenerate it
      if (token.accessToken && token.id && token.email) {
        const currentToken = token.accessToken as string;
        const shouldRefresh = await isTokenExpiringSoon(currentToken);
        if (shouldRefresh) {
          try {
            token.accessToken = await generateSupabaseToken(
              token.id as string,
              token.email as string
            );
          } catch (err) {
            console.error("Failed to refresh Supabase token:", err);
            // Keep the old token — it may still work or the user will need to re-login
          }
        }
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
    signOut: "/auth", // M2: Redirect to auth page on sign-out
  },
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // M3: 1 day — aligned with Supabase token TTL
  },
  secret: authSecret,
});
