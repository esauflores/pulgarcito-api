// External
import { defaultKeyHasher } from "@better-auth/api-key";

// App
import { testBindings } from "@/env";

// Database
import { apikey } from "@/db/schema";

// Infrastructure
import { auth } from "@/infrastructure/auth/better-auth";
import { db } from "@/infrastructure/db";

export const makeUser = async (identifier: string) => {
  const result = await auth(testBindings).api.signUpEmail({
    body: {
      name: "Test User",
      email: `${identifier}@example.com`,
      password: "test-password-123",
    },
  });

  return result.user;
};

export const makeKey = async (userId: string) => {
  const plaintext = `pk_${crypto.randomUUID()}`;
  const hashed = await defaultKeyHasher(plaintext);

  await db(testBindings).insert(apikey).values({
    id: crypto.randomUUID(),
    referenceId: userId,
    key: hashed,
  });

  return plaintext;
};

export const makeUserWithKey = async (refId: string) => {
  const userRecord = await makeUser(refId);
  return makeKey(userRecord.id);
};
