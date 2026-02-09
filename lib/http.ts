import { NextResponse } from "next/server";

import { HttpError } from "@/lib/errors";

export function ok<T>(data: T, status = 200): NextResponse<T> {
  return NextResponse.json(data, { status });
}

export function fail(status: number, code: string, error: string): NextResponse<{ code: string; error: string }> {
  return NextResponse.json({ code, error }, { status });
}

export function fromError(error: unknown): NextResponse<{ code: string; error: string }> {
  if (error instanceof HttpError) {
    return fail(error.status, error.code, error.message);
  }

  console.error(error);
  return fail(500, "INTERNAL_ERROR", "Внутренняя ошибка сервера.");
}
