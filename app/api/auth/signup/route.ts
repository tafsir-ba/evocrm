import { handleRouteError, successResponse } from "@/server/api/responses";
import { registerCredentialsUser } from "@/server/services/credentials-auth";
import { parseRequestOrThrow } from "@/server/validation/request";
import { signupInputSchema } from "@/server/validation/auth";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const input = parseRequestOrThrow(signupInputSchema, body);
    const user = await registerCredentialsUser(input);

    return successResponse(
      {
        user: {
          id: user.id,
          email: user.email,
          name: user.name ?? null,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
