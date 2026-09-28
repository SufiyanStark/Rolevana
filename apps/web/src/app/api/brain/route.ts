import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { readBrainSnapshot } from "@/lib/brain-store";
import { processWithRolevana, runRolevanaBrain } from "@/lib/brain-service";

export async function GET(){const user=await getSessionUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});return NextResponse.json(await readBrainSnapshot(user.id));}
export async function POST(request:Request){const user=await getSessionUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});try{const body=await request.json() as {jobId?:string;limit?:number};const records=body.jobId?[await processWithRolevana(user.id,body.jobId)]:await runRolevanaBrain(user.id,body.limit??1);return NextResponse.json({records,applicationsSubmitted:0,emailsSent:0,aiCostUsd:0});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Brain processing failed"},{status:400});}}
