import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.server";

describe("password.server", () => {
  it("creates a salted PBKDF2 hash and verifies the original password", async () => {
    const password = "Gestta!SenhaSegura2026";
    const result = await hashPassword(password);

    expect(result.passwordHash).not.toBe(password);
    expect(result.passwordSalt).toHaveLength(22);
    expect(await verifyPassword(password, result.passwordHash, result.passwordSalt)).toBe(true);
    expect(await verifyPassword("outra senha incorreta", result.passwordHash, result.passwordSalt)).toBe(false);
  });

  it("uses a different random salt for each password hash", async () => {
    const password = "Gestta!SenhaSegura2026";
    const first = await hashPassword(password);
    const second = await hashPassword(password);

    expect(first.passwordSalt).not.toBe(second.passwordSalt);
    expect(first.passwordHash).not.toBe(second.passwordHash);
  });

  it("rejects passwords outside the accepted length", async () => {
    await expect(hashPassword("curta")).rejects.toThrow("12 e 200");
    await expect(hashPassword("x".repeat(201))).rejects.toThrow("12 e 200");
  });

  it("returns false for malformed stored hashes", async () => {
    expect(await verifyPassword("Gestta!SenhaSegura2026", "invalid", "invalid")).toBe(false);
  });
});
