import { connection } from "next/server";
import { axisStatus, getAxisClient } from "@/lib/axis";
import { errorResponse, json, readBody } from "@/lib/http";

export async function GET() {
  await connection();
  return json(axisStatus());
}

export async function POST(request: Request) {
  try {
    await readBody(request);
    await getAxisClient().test();
    return json({ ok: true, verifiedAt: new Date().toISOString() });
  } catch (error) {
    return errorResponse(error);
  }
}
