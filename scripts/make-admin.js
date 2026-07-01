/* eslint-disable */
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

// Parse .env file
const envPath = path.join(__dirname, "../.env");
if (!fs.existsSync(envPath)) {
  console.error("Error: .env file not found at project root!");
  process.exit(1);
}

const envFile = fs.readFileSync(envPath, "utf8");
const envVars = {};
envFile.split("\n").forEach((line) => {
  const parts = line.split("=");
  if (parts.length >= 2) {
    const key = parts[0].trim();
    let val = parts.slice(1).join("=").trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.substring(1, val.length - 1);
    }
    envVars[key] = val;
  }
});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = envVars.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Error: Missing Supabase URL or Service Role Key in .env!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

const email = process.argv[2];
if (!email) {
  console.log("Usage: node scripts/make-admin.js <email>");
  process.exit(1);
}

async function main() {
  console.log(`Searching for user with email: ${email}...`);
  
  // 1. Get user from auth
  const { data: listData, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error("Error fetching users:", listError.message);
    process.exit(1);
  }

  const user = listData.users.find((u) => u.email === email);
  if (!user) {
    console.error(`Error: No user found with email '${email}' in auth.users.`);
    console.log("Please sign up or register this email address in the application first.");
    process.exit(1);
  }

  const userId = user.id;
  console.log(`Found user: ${user.email} (ID: ${userId})`);

  // 2. Insert role into user_roles
  console.log("Assigning 'admin' role in user_roles table...");
  
  // Check if role already exists
  const { data: existingRole, error: roleCheckError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (roleCheckError) {
    console.error("Error checking roles:", roleCheckError.message);
    process.exit(1);
  }

  if (existingRole) {
    console.log("User already has the 'admin' role assigned!");
    process.exit(0);
  }

  // Insert role
  const { error: insertError } = await supabase
    .from("user_roles")
    .insert({
      user_id: userId,
      role: "admin"
    });

  if (insertError) {
    console.error("Error inserting admin role:", insertError.message);
    process.exit(1);
  }

  console.log(`Success! '${email}' has been successfully assigned the 'admin' role.`);
}

main();
