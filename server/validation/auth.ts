import "server-only";

import { z } from "zod";

const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters.")
  .regex(/[a-zA-Z]/, "Password must include at least one letter.")
  .regex(/[0-9]/, "Password must include at least one number.");

export const signupInputSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email(),
    password: passwordSchema,
    confirmPassword: z.string().min(1),
  })
  .refine((input) => input.password === input.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type SignupInput = z.infer<typeof signupInputSchema>;

export const credentialsLoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export type CredentialsLoginInput = z.infer<typeof credentialsLoginSchema>;
