// Thin wrapper for lambda handlers. Catches auth + validation errors and
// maps them to the right HTTP response so every handler doesn't repeat it.

import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { ZodError } from "zod";
import { AuthError } from "./auth";
import { badRequest, serverError, unauthorized } from "./response";

type Handler = (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
) => Promise<APIGatewayProxyStructuredResultV2>;

export function wrap(fn: Handler): Handler {
  return async (event) => {
    try {
      return await fn(event);
    } catch (err) {
      if (err instanceof AuthError) return unauthorized(err.message);
      if (err instanceof ZodError) {
        return badRequest("validation failed", err.flatten());
      }
      if (err instanceof SyntaxError || (err instanceof Error && err.message === "invalid JSON body")) {
        return badRequest(err.message);
      }
      console.error("handler error", err);
      return serverError();
    }
  };
}
