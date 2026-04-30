import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";

// The HTTP API JWT authorizer puts Cognito claims on
// event.requestContext.authorizer.jwt.claims. `sub` is the stable user id.
export function requireUserId(event: APIGatewayProxyEventV2WithJWTAuthorizer): string {
  const sub = event.requestContext.authorizer?.jwt?.claims?.sub;
  if (typeof sub !== "string" || sub.length === 0) {
    throw new AuthError("missing sub claim");
  }
  return sub;
}

export class AuthError extends Error {}
