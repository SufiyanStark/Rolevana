import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { addJobSourceFromUrl, readJobSourceRegistry, setJobSourceEnabled } from "@/lib/job-store";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ sources: await readJobSourceRegistry(user.id) });
}
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json() as { companyName?: string; boardUrl?: string };
  if (!body.boardUrl) return NextResponse.json({ error: "Board URL is required." }, { status: 400 });
  try { return NextResponse.json({ source: await addJobSourceFromUrl(user.id, body.companyName ?? "", body.boardUrl) }, { status: 201 }); }
  catch { return NextResponse.json({ error: "Unsupported ATS board URL." }, { status: 400 }); }
}
export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json() as { id?: string; enabled?: boolean };
  if (!body.id || typeof body.enabled !== "boolean") return NextResponse.json({ error: "Source id and enabled state are required." }, { status: 400 });
  return NextResponse.json({ source: await setJobSourceEnabled(user.id, body.id, body.enabled) });
}
