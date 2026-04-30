import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

const headers = {
  "content-type": "application/json",
};

export const ok = (body: unknown): APIGatewayProxyStructuredResultV2 => ({
  statusCode: 200,
  headers,
  body: JSON.stringify(body),
});

export const created = (body: unknown): APIGatewayProxyStructuredResultV2 => ({
  statusCode: 201,
  headers,
  body: JSON.stringify(body),
});

export const noContent = (): APIGatewayProxyStructuredResultV2 => ({
  statusCode: 204,
});

export const badRequest = (message: string, details?: unknown) => error(400, message, details);
export const unauthorized = (message = "unauthorized") => error(401, message);
export const notFound = (message = "not found") => error(404, message);
export const conflict = (message: string) => error(409, message);
export const serverError = (message = "server error") => error(500, message);

function error(statusCode: number, message: string, details?: unknown): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers,
    body: JSON.stringify({ error: message, ...(details ? { details } : {}) }),
  };
}
