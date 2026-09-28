import { Card } from "@rolevana/ui";
export default function ApplicationsPage() { return <Empty title="Applications" copy="Prepared dry-run packages will appear in job intelligence. Phase 3A submits nothing and sends no email."/>; }
function Empty({title,copy}:{title:string;copy:string}) { return <div><h1 className="m-0 text-3xl font-semibold">{title}</h1><p className="mt-2 text-sm text-slate-400">Application history and outcomes.</p><Card className="mt-6 grid min-h-72 place-items-center p-8 text-center"><div><div className="text-lg font-semibold">Nothing submitted yet</div><p className="mx-auto max-w-md text-sm leading-6 text-slate-500">{copy}</p></div></Card></div>; }

