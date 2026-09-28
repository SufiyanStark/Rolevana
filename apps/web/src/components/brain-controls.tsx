"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@rolevana/ui";

export function BrainControls({jobId}:{jobId?:string}){const router=useRouter();const[limit,setLimit]=useState(1);const[running,setRunning]=useState(false);const[message,setMessage]=useState("");async function run(){setRunning(true);setMessage("");const response=await fetch("/api/brain",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(jobId?{jobId}:{limit})});const body=await response.json() as {records?:unknown[];error?:string};setMessage(response.ok?`${body.records?.length??0} job${body.records?.length===1?"":"s"} processed safely.`:body.error??"Processing failed.");setRunning(false);router.refresh();}
return <div className="flex flex-wrap items-center gap-2">{!jobId&&<label className="flex items-center gap-2 text-xs text-slate-400">Limit<select className="rounded-md border border-white/10 bg-slate-950 px-2 py-2 text-slate-200" value={limit} onChange={(event)=>setLimit(Number(event.target.value))}>{[1,5,10].map((value)=><option key={value}>{value}</option>)}</select></label>}<Button onClick={run} disabled={running}>{running?"Processing…":jobId?"Process With Rolevana":"Run Rolevana Brain"}</Button>{message&&<span className="text-xs text-slate-400" role="status">{message}</span>}</div>}
