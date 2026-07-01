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
const license = process.argv[3] || "DL-987654321";
const experience = process.argv[4] || "5";

if (!email) {
  console.log("Usage: node scripts/make-driver.js <email> [license_number] [experience_years]");
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
  console.log("Assigning 'driver' role in user_roles table...");
  const { error: roleInsertError } = await supabase
    .from("user_roles")
    .upsert({
      user_id: userId,
      role: "driver"
    }, { onConflict: "user_id, role" });

  if (roleInsertError) {
    console.error("Error inserting driver role:", roleInsertError.message);
    process.exit(1);
  }

  // 3. Create driver profile in drivers table (set to verified and available immediately)
  console.log("Creating/updating entry in drivers table...");
  const { error: driverInsertError } = await supabase
    .from("drivers")
    .upsert({
      user_id: userId,
      license_number: license,
      experience_years: parseInt(experience, 10),
      is_available: true,
      is_verified: true, // Auto-approve
      rating: 5.00
    }, { onConflict: "user_id" });

  if (driverInsertError) {
    console.error("Error inserting driver record:", driverInsertError.message);
    process.exit(1);
  }

  console.log(`Success! '${email}' has been successfully created and verified as a driver.`);
}

main();
