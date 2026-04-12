import { mkdir, writeFile } from "fs/promises";
import * as os from "os";
import * as path from "path";
import { randomBytes } from "crypto";

const SUBDIR = "salesdoc-imports";

function importsBaseDir(): string {
  return path.join(os.tmpdir(), SUBDIR);
}

/**
 * Worker va API bir xil katalogdan foydalanadi; path traversal oldini olish uchun tekshiruv.
 */
export function isSafeImportTempPath(filePath: string): boolean {
  const base = path.resolve(importsBaseDir());
  const resolved = path.resolve(filePath);
  if (resolved === base) return false;
  const prefix = base + path.sep;
  return resolved.startsWith(prefix);
}

/** @deprecated `isSafeImportTempPath` dan foydalaning */
export const isSafeClientImportPath = isSafeImportTempPath;

async function writeTempXlsx(buf: Buffer, prefix: string): Promise<string> {
  const dir = importsBaseDir();
  await mkdir(dir, { recursive: true });
  const name = `${prefix}-${Date.now()}-${randomBytes(8).toString("hex")}.xlsx`;
  const full = path.join(dir, name);
  await writeFile(full, buf, { mode: 0o600 });
  return full;
}

export async function writeClientImportTempFile(buf: Buffer): Promise<string> {
  return writeTempXlsx(buf, "cli");
}

export async function writeStockImportTempFile(buf: Buffer): Promise<string> {
  return writeTempXlsx(buf, "stk");
}

export async function writeProductImportTempFile(buf: Buffer): Promise<string> {
  return writeTempXlsx(buf, "prd");
}

export async function writePriceImportTempFile(buf: Buffer): Promise<string> {
  return writeTempXlsx(buf, "prc");
}
