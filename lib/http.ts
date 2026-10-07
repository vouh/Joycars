import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@/lib/generated/prisma/client';
import { env } from '@/lib/env';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Resource') => new ApiError(404, 'not_found', `${what} not found.`);

export function json(data: unknown, init?: ResponseInit & { cache?: 'no-store' | 'public' }) {
  const headers = new Headers(init?.headers);
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', init?.cache === 'public' ? 'public, s-maxage=60, stale-while-revalidate=300' : 'no-store');
  return NextResponse.json(data, { ...init, headers });
}

function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return json({ error: { code: error.code, message: error.message, details: error.details } }, { status: error.status });
  }
  if (error instanceof z.ZodError) {
    return json({ error: { code: 'validation_failed', message: 'Please check the highlighted fields.', fields: fieldErrors(error) } }, { status: 422 });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return json({ error: { code: 'conflict', message: 'A record with these details already exists.' } }, { status: 409 });
    if (error.code === 'P2025') return json({ error: { code: 'not_found', message: 'Resource not found.' } }, { status: 404 });
    if (error.code === 'P2003') return json({ error: { code: 'conflict', message: 'This record is still referenced elsewhere.' } }, { status: 409 });
  }
  // Log only the error type/message — never request bodies, which may hold customer data.
  console.error('[api] unhandled error', error instanceof Error ? `${error.name}: ${error.message}` : 'unknown');
  return json({ error: { code: 'internal_error', message: 'Something went wrong. Please try again.' } }, { status: 500 });
}

export function fieldErrors(error: z.ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }
  return fields;
}

/** Wraps a route handler with consistent, safe error responses. */
export function route<Ctx>(handler: (req: NextRequest, ctx: Ctx) => Promise<Response>) {
  return async (req: NextRequest, ctx: Ctx): Promise<Response> => {
    try {
      return await handler(req, ctx);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

const MAX_JSON_BYTES = 64 * 1024;

export async function readJson(req: NextRequest): Promise<unknown> {
  const length = Number(req.headers.get('content-length') ?? 0);
  if (length > MAX_JSON_BYTES) throw new ApiError(413, 'payload_too_large', 'Request is too large.');
  const text = await req.text();
  if (text.length > MAX_JSON_BYTES) throw new ApiError(413, 'payload_too_large', 'Request is too large.');
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(400, 'invalid_json', 'Request body must be valid JSON.');
  }
}

/** Reads JSON or a submitted HTML form (progressive enhancement) into a plain object. */
export async function readBody(req: NextRequest): Promise<unknown> {
  const type = req.headers.get('content-type') ?? '';
  if (type.includes('application/x-www-form-urlencoded') || type.includes('multipart/form-data')) {
    const form = await req.formData();
    const out: Record<string, unknown> = {};
    for (const [key, value] of form.entries()) if (typeof value === 'string') out[key] = value;
    return out;
  }
  return readJson(req);
}

/**
 * CSRF protection for cookie-authenticated mutations: the request must come
 * from our own origin. Browsers always send Origin on cross-site POST/PATCH/DELETE.
 */
export function assertSameOrigin(req: NextRequest) {
  const allowed = new Set([new URL(env().APP_URL).origin, req.nextUrl.origin]);
  // The host the browser actually used (nextUrl can report the bind address, e.g. 0.0.0.0).
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (host) allowed.add(`${req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol.replace(':', '')}://${host}`);
  const origin = req.headers.get('origin');
  if (origin ? allowed.has(origin) : req.headers.get('sec-fetch-site') === 'same-origin') return;
  throw new ApiError(403, 'forbidden_origin', 'Cross-site requests are not allowed.');
}

export function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
}

export function parseQuery<T extends z.ZodType>(req: NextRequest, schema: T): z.infer<T> {
  return schema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
}
