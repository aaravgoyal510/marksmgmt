import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

function validatePasswordStrength(password: string): boolean {
  if (password.length < 12) return false;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  return hasUpper && hasLower && hasDigit && hasSpecial;
}

export async function runProductionSeed(env = process.env) {
  const dbUrl = env.DATABASE_URL || "";
  let hostSanitized = "Unknown";
  try {
    const parsed = new URL(dbUrl);
    hostSanitized = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    hostSanitized = "[Unparseable connection URL]";
  }

  console.log(`[Seed:Prod] Target Database: ${hostSanitized}`);

  const adminPassword = env.ADMIN_INITIAL_PASSWORD;
  if (!adminPassword || !adminPassword.trim()) {
    throw new Error(
      "[Seed:Prod] ABORT: ADMIN_INITIAL_PASSWORD environment variable is not set. A strong initial password is required."
    );
  }

  if (!validatePasswordStrength(adminPassword)) {
    throw new Error(
      "[Seed:Prod] ABORT: ADMIN_INITIAL_PASSWORD does not meet production security criteria (minimum 12 characters, including uppercase, lowercase, digit, and special character)."
    );
  }

  // Refuse to run if any ADMIN user already exists
  const existingAdmin = await prisma.user.findFirst({
    where: { role: Role.ADMIN },
  });

  if (existingAdmin) {
    throw new Error(
      `[Seed:Prod] ABORT: An Administrator user already exists (username: ${existingAdmin.username}). Production seed will not overwrite or duplicate existing admins.`
    );
  }

  const saltRounds = 12;
  const passwordHash = await bcrypt.hash(adminPassword, saltRounds);

  const adminUser = await prisma.user.create({
    data: {
      username: "admin",
      passwordHash,
      role: Role.ADMIN,
      email: "admin@bvimr.ac.in",
      isActive: true,
      emailNotifications: true,
    },
  });

  console.log("==================================================================");
  console.log("  PRODUCTION ADMIN ACCOUNT INITIALIZED SUCCESSFULLY");
  console.log("==================================================================");
  console.log(`  Username : ${adminUser.username}`);
  console.log(`  Role     : ${adminUser.role}`);
  console.log(`  User ID  : ${adminUser.id}`);
  console.log(`  Email    : ${adminUser.email}`);
  console.log("  Password : [CONFIGURED VIA ADMIN_INITIAL_PASSWORD]");
  console.log("==================================================================");
  console.log("  NOTE: Please change this password immediately after first login.");
  console.log("==================================================================");

  return adminUser;
}

if (process.env.NODE_ENV !== "test") {
  runProductionSeed()
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
