/**
 * Bootstrap the first administrator.
 *
 *   npm run admin:create -- "Vineeth" vineeth@livingbyitr.com
 *
 * Chicken-and-egg: employees are created from inside the panel, and the panel
 * needs an admin to sign in. This is the only way an account is created without
 * an authenticated actor, which is why it's a CLI script and not a route.
 */
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { users } from "../lib/db/schema";
import { generatePassword, hashPassword } from "../lib/auth/password";
import { newId } from "../lib/ids";

async function main() {
  const [fullName, rawEmail, rawPassword] = process.argv.slice(2);
  if (!fullName || !rawEmail) {
    console.error(
      'Usage: npm run admin:create -- "Full Name" email@domain.com [password]',
    );
    process.exit(1);
  }

  const email = rawEmail.trim().toLowerCase();
  const password = rawPassword || generatePassword();

  const [existing] = await db()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    // Promote and reset rather than fail — this script is also the "I'm locked
    // out" recovery path.
    await db()
      .update(users)
      .set({
        role: "admin",
        isActive: true,
        passwordHash: await hashPassword(password),
        mustChangePassword: !rawPassword,
        failedLoginCount: 0,
        lockedUntil: null,
      })
      .where(eq(users.id, existing.id));
    console.log(`Updated existing account ${email} to administrator.`);
  } else {
    await db()
      .insert(users)
      .values({
        id: newId(),
        fullName,
        email,
        role: "admin",
        passwordHash: await hashPassword(password),
        mustChangePassword: !rawPassword,
        joinedAt: new Date(),
      });
    console.log(`Created administrator ${email}.`);
  }

  if (!rawPassword) {
    console.log(`Temporary password: ${password}`);
    console.log("You'll be asked to change it at first sign-in.");
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
