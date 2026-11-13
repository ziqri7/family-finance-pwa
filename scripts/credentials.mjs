import { randomBytes, pbkdf2Sync } from "node:crypto";
export function credentials() {
  const passwords = [];
  const users = ["partner-a", "partner-b"].map((id, i) => {
    const password = randomBytes(24).toString("base64url"),
      salt = randomBytes(16).toString("hex");
    passwords.push(password);
    return {
      id,
      name: i ? "Istri" : "Suami",
      email: i ? "istri@example.invalid" : "suami@example.invalid",
      salt,
      hash: pbkdf2Sync(
        password,
        Buffer.from(salt, "hex"),
        100000,
        32,
        "sha256",
      ).toString("hex"),
      iterations: 100000,
    };
  });
  return { users, passwords, secret: randomBytes(32).toString("hex") };
}
