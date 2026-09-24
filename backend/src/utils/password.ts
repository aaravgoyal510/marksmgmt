import bcrypt from "bcrypt";

// Ambiguous characters excluded (0/O, 1/l/I) so generated passwords can be easily read on printouts
const SAFE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

export function generatePassword(length = 10): string {
  return Array.from({ length }, () =>
    SAFE_CHARS[Math.floor(Math.random() * SAFE_CHARS.length)]
  ).join("");
}

export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
