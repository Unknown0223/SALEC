import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/proxy-to-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { path?: string[] } };

function segments(ctx: Ctx): string[] {
  return ctx.params.path ?? [];
}

export async function GET(req: NextRequest, ctx: Ctx) {
  return proxyToBackend(req, "/api", segments(ctx));
}

export async function POST(req: NextRequest, ctx: Ctx) {
  return proxyToBackend(req, "/api", segments(ctx));
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  return proxyToBackend(req, "/api", segments(ctx));
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  return proxyToBackend(req, "/api", segments(ctx));
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return proxyToBackend(req, "/api", segments(ctx));
}

export async function OPTIONS(req: NextRequest, ctx: Ctx) {
  return proxyToBackend(req, "/api", segments(ctx));
}
