import { AppError } from "@masulino/contracts";
import type { StaffCredentialPort } from "@masulino/core";
import { getAuth } from "./auth";

export const staffCredentials: StaffCredentialPort = {
  async provision(input) {
    const context = await getAuth().$context;
    const email = input.email.toLowerCase();
    const existing = await context.internalAdapter.findUserByEmail(email);
    if (existing?.user) throw new AppError("conflict", "email_taken");
    const hash = await context.password.hash(input.password);
    let userId: string | null = null;
    try {
      const user = await context.internalAdapter.createUser({
        email,
        name: input.name,
        emailVerified: true,
      }, { method: "email-password" });
      if (!user?.id) throw new AppError("conflict", "login_not_created");
      userId = user.id;
      await context.internalAdapter.linkAccount({
        userId: user.id,
        accountId: user.id,
        providerId: "credential",
        password: hash,
      });
      return { subject: user.id };
    } catch (error) {
      if (userId) {
        try {
          await context.internalAdapter.deleteUser(userId);
        } catch {
          console.error("staff login was not retired");
        }
      }
      if (error instanceof AppError) throw error;
      console.error("staff login was not created");
      throw new AppError("conflict", "login_not_created");
    }
  },

  async retire(subject) {
    const context = await getAuth().$context;
    const existing = await context.internalAdapter.findUserById(subject);
    if (!existing) return;
    await context.internalAdapter.deleteUser(subject);
  },
};
