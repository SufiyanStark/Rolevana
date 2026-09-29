import { FreeProviderUnavailableError, NvidiaProvider, OpenRouterProvider, PrivacyAwareFreeAIProviderRouter, verifiedFreePricing, WaitingForFreeAIError, type RoutedProviderCandidate } from "@rolevana/ai";
import { assertNoCandidatePII, buildEvidenceGraph, createMasterResumeRepresentation, diffResumeContent, hasMeasurableATSGain, prepareApplication, sanitizeCandidateProfile, sanitizeCandidateText, stableHash, validateATS, validateTruthfulness, type BrainRecord, type TailoredResumeContent } from "@rolevana/brain";
import type { CandidateProfile, MasterResume } from "@rolevana/domain";
import type { NormalizedJob } from "@rolevana/job-sources";
import { readAIProviderHealth } from "./job-store";

type AIResumePayload = { summary: string; orderedSkills: string[]; bullets: Array<{ id: string; text: string; sourceEvidenceIds: string[] }> };

const parseJson = (value: string): AIResumePayload => {
  const match = value.match(/\{[\s\S]*\}/);
  if (!match) throw new FreeProviderUnavailableError("FREE_MODEL_UNAVAILABLE", "The provider did not return JSON.");
  const parsed = JSON.parse(match[0]) as Partial<AIResumePayload>;
  if (typeof parsed.summary !== "string" || !Array.isArray(parsed.orderedSkills) || !Array.isArray(parsed.bullets)) throw new FreeProviderUnavailableError("FREE_MODEL_UNAVAILABLE", "The provider returned an invalid resume schema.");
  return {
    summary: parsed.summary,
    orderedSkills: parsed.orderedSkills.filter((item): item is string => typeof item === "string"),
    bullets: parsed.bullets.filter((item): item is AIResumePayload["bullets"][number] => Boolean(item) && typeof item.id === "string" && typeof item.text === "string" && Array.isArray(item.sourceEvidenceIds))
  };
};

async function candidates(userId: string): Promise<RoutedProviderCandidate[]> {
  const health = await readAIProviderHealth(userId);
  const result: RoutedProviderCandidate[] = [];
  const usageMode = process.env.ROLEVANA_USAGE_MODE === "PRODUCTION" ? "PRODUCTION" as const : "DEVELOPMENT" as const;
  for (const item of [...health].sort((left,right) => left.provider === "nvidia" ? -1 : right.provider === "nvidia" ? 1 : 0)) {
    const checkedAt = new Date(item.checkedAt).getTime();
    const fresh = Number.isFinite(checkedAt) && Date.now() - checkedAt <= 5 * 60_000;
    if (!fresh || item.status !== "WORKING" || !item.freeVerified || !item.model || !item.privacyClasses?.includes("SANITIZED_CANDIDATE_DATA")) continue;
    if (item.provider === "openrouter" && process.env.OPENROUTER_API_KEY) result.push({ provider: new OpenRouterProvider(item.model, process.env.OPENROUTER_API_KEY), pricing: verifiedFreePricing("PROVIDER_METADATA"), entitlement:"FREE_PRODUCTION_ENDPOINT",usageMode,allowedPrivacyClasses: ["PUBLIC_JOB_DATA", "SANITIZED_CANDIDATE_DATA"], tasks: ["RESUME_TAILORING","TRUTHFULNESS_REVIEW"],capabilities:["HIGH_REASONING","LONG_CONTEXT","STRUCTURED_OUTPUT"], capacity: 1 });
    if (item.provider === "nvidia" && process.env.NVIDIA_API_KEY && item.entitlement === "FREE_DEVELOPMENT_ENDPOINT" && usageMode === "DEVELOPMENT") result.push({ provider: new NvidiaProvider(item.model, process.env.NVIDIA_API_KEY,undefined,process.env.NVIDIA_BASE_URL), pricing: verifiedFreePricing("OFFICIAL_DEVELOPMENT_ENTITLEMENT"),entitlement:item.entitlement,usageMode,allowedPrivacyClasses: ["PUBLIC_JOB_DATA", "SANITIZED_CANDIDATE_DATA"], tasks: ["RESUME_TAILORING","TRUTHFULNESS_REVIEW"],capabilities:["HIGH_REASONING","LONG_CONTEXT","CODING","STRUCTURED_OUTPUT"], capacity: 1 });
  }
  return result;
}

export async function applyAIResumeTailoring(userId: string, job: NormalizedJob, profile: CandidateProfile, resume: MasterResume | null, record: BrainRecord): Promise<BrainRecord> {
  if (!record.match || record.resumeStrategy !== "TAILORED_RESUME" || !record.tailoringOpportunity || !["MEDIUM","HIGH"].includes(record.tailoringOpportunity.estimatedBenefit)) return record;
  const graph = buildEvidenceGraph(profile, resume);
  const aiEvidenceNodes = graph.nodes.filter((node) => node.kind !== "MASTER_RESUME");
  const outboundIds = new Map(aiEvidenceNodes.map((node, index) => [node.id, `evidence-${node.kind.toLowerCase()}-${index + 1}`]));
  const inboundIds = new Map([...outboundIds].map(([internal, outbound]) => [outbound, internal]));
  const allowedIds = new Set(inboundIds.keys());
  const allowedSkills = new Set(profile.skills.map((item) => item.name.toLowerCase()));
  const sanitized = sanitizeCandidateProfile(profile);
  const evidence = aiEvidenceNodes.map((node) => ({ id: outboundIds.get(node.id)!, kind: node.kind, label: sanitizeCandidateText(node.label, profile), text: sanitizeCandidateText(node.text, profile) }));
  const sanitization = assertNoCandidatePII({ sanitized, evidence }, profile);
  record.sanitization = { ...sanitization, prohibitedPIIFound: false };
  const prompt = `Create an ATS-readable structured tailored resume preview for this public job. Return JSON exactly as {"summary":string,"orderedSkills":string[],"bullets":[{"id":string,"text":string,"sourceEvidenceIds":string[]}]}. Use only skills and evidence IDs supplied. Preserve all facts and numbers. Do not add unsupported JD terms.\nJOB=${JSON.stringify({ title: job.title, description: job.description.slice(0, 9000), requirements: job.requirements, preferred: job.preferredQualifications })}\nSANITIZED_CANDIDATE=${JSON.stringify(sanitized)}\nEVIDENCE=${JSON.stringify(evidence)}`;
  const availableCandidates=await candidates(userId);
  const eligibleCandidates=record.tailoringOpportunity.estimatedBenefit==="HIGH"?availableCandidates:availableCandidates.filter((candidate)=>candidate.provider.id!=="nvidia");
  const nvidiaCandidates=eligibleCandidates.filter((candidate)=>candidate.provider.id==="nvidia");
  const router = new PrivacyAwareFreeAIProviderRouter(nvidiaCandidates.length?nvidiaCandidates:eligibleCandidates);
  const routed = await router.execute("RESUME_TAILORING", "SANITIZED_CANDIDATE_DATA", async (provider) => {
    if (!provider.completeStructured) throw new FreeProviderUnavailableError("FREE_MODEL_UNAVAILABLE", "Provider lacks structured completion support.");
    return provider.completeStructured(prompt,provider.id==="nvidia"?{enableThinking:false,temperature:.2,topP:.95,maxTokens:3200,timeoutMs:90_000}:{temperature:0,maxTokens:4800});
  },["HIGH_REASONING","STRUCTURED_OUTPUT"]);
  const parsed = parseJson(routed.value.content);
  const outboundContent: TailoredResumeContent = { summary: parsed.summary, orderedSkills: parsed.orderedSkills, bullets: parsed.bullets };
  assertNoCandidatePII(outboundContent, profile);
  const exactModel = routed.value.resolvedModel ?? routed.model;
  const unknownEvidence = outboundContent.bullets.flatMap((item) => item.sourceEvidenceIds).filter((id) => !allowedIds.has(id));
  const content: TailoredResumeContent = { ...outboundContent, bullets: outboundContent.bullets.map((item) => ({ ...item, sourceEvidenceIds: item.sourceEvidenceIds.map((id) => inboundIds.get(id) ?? id) })) };
  const unsupportedSkills = content.orderedSkills.filter((skill) => !allowedSkills.has(skill.toLowerCase()));
  const truth = validateTruthfulness(content, graph);
  if (unknownEvidence.length || unsupportedSkills.length || !truth.valid) {
    record.truthfulness = { valid: false, rejectedBulletIds: [...truth.rejectedBulletIds, ...outboundContent.bullets.filter((item) => item.sourceEvidenceIds.some((id) => !allowedIds.has(id))).map((item) => item.id)], unsupportedSkills: [...truth.unsupportedSkills, ...unsupportedSkills], status: "FAILED" };
    record.state = "NEEDS_REVIEW";
    record.reviewReasons.push("AI-tailored content failed deterministic truthfulness validation and was rejected.");
    record.provenance.push({ provider: routed.provider, model: exactModel, latencyMs: routed.value.latencyMs, fallbackCount: routed.fallbackCount, aiCostUsd: 0, aiNecessary:true, task: "RESUME_TAILORING", privacyClass: "SANITIZED_CANDIDATE_DATA",entitlement:routed.provider==="nvidia"?"FREE_DEVELOPMENT_ENDPOINT":"FREE_PRODUCTION_ENDPOINT",environment:routed.provider==="nvidia"?"DEVELOPMENT_ONLY":"PRODUCTION_ALLOWED",freeVerified:true,timestamp:new Date().toISOString() });
    record.updatedAt = new Date().toISOString();
    return record;
  }
  let semanticProvenance:BrainRecord["provenance"][number]|null=null;
  const verifierCandidates=availableCandidates.filter((candidate)=>candidate.provider.id!==routed.provider);
  if(verifierCandidates.length){
    const verificationPayload={job:{title:job.title,description:job.description.slice(0,9000),requirements:job.requirements,preferred:job.preferredQualifications},content:outboundContent,evidence};
    assertNoCandidatePII(verificationPayload,profile);
    try{const verification=await new PrivacyAwareFreeAIProviderRouter(verifierCandidates).execute("TRUTHFULNESS_REVIEW","SANITIZED_CANDIDATE_DATA",async(provider)=>{if(!provider.completeStructured)throw new FreeProviderUnavailableError("FREE_MODEL_UNAVAILABLE","Provider lacks structured completion support.");return provider.completeStructured(`Audit this tailored resume against the supplied evidence. Return only JSON as {"valid":boolean,"unsupportedBulletIds":string[]}. Mark invalid if any skill, metric, technology, experience, or achievement lacks evidence. PAYLOAD=${JSON.stringify(verificationPayload)}`,{temperature:0,maxTokens:1000});},["STRUCTURED_OUTPUT"]);const match=verification.value.content.match(/\{[\s\S]*\}/);if(!match)throw new FreeProviderUnavailableError("FREE_MODEL_UNAVAILABLE","Truthfulness verifier returned malformed output.");const verdict=JSON.parse(match[0]) as {valid?:unknown;unsupportedBulletIds?:unknown};if(typeof verdict.valid!=="boolean"||!Array.isArray(verdict.unsupportedBulletIds))throw new FreeProviderUnavailableError("FREE_MODEL_UNAVAILABLE","Truthfulness verifier returned an invalid schema.");const rejectedIds=verdict.unsupportedBulletIds.filter((id):id is string=>typeof id==="string");if(!verdict.valid&&!rejectedIds.length)throw new FreeProviderUnavailableError("FREE_MODEL_UNAVAILABLE","Truthfulness verifier returned an inconsistent negative verdict.");record.semanticVerification=verdict.valid?"VERIFIED":"FAILED";semanticProvenance={provider:verification.provider,model:verification.value.resolvedModel??verification.model,latencyMs:verification.value.latencyMs,fallbackCount:verification.fallbackCount,aiCostUsd:0,aiNecessary:true,task:"SEMANTIC_TRUTHFULNESS_REVIEW",privacyClass:"SANITIZED_CANDIDATE_DATA",entitlement:"FREE_PRODUCTION_ENDPOINT",environment:"PRODUCTION_ALLOWED",freeVerified:true,timestamp:new Date().toISOString()};if(!verdict.valid){record.truthfulness={valid:false,rejectedBulletIds:rejectedIds,unsupportedSkills:[],status:"FAILED"};record.state="NEEDS_REVIEW";record.reviewReasons.push("Independent semantic truthfulness verification rejected generated claims.");record.provenance.push({provider:routed.provider,model:exactModel,latencyMs:routed.value.latencyMs,fallbackCount:routed.fallbackCount,aiCostUsd:0,aiNecessary:true,task:"RESUME_TAILORING",privacyClass:"SANITIZED_CANDIDATE_DATA",entitlement:routed.provider==="nvidia"?"FREE_DEVELOPMENT_ENDPOINT":"FREE_PRODUCTION_ENDPOINT",environment:routed.provider==="nvidia"?"DEVELOPMENT_ONLY":"PRODUCTION_ALLOWED",freeVerified:true,timestamp:new Date().toISOString()},semanticProvenance);return record;}}catch(error){if(!(error instanceof WaitingForFreeAIError||error instanceof FreeProviderUnavailableError))throw error;record.semanticVerification="SKIPPED_PROVIDER_UNAVAILABLE";}
  } else record.semanticVerification="SKIPPED_PROVIDER_UNAVAILABLE";
  const master = createMasterResumeRepresentation(profile, graph);
  const baselineATS = validateATS(job, master, record.match);
  const ats = validateATS(job, content, record.match);
  const changes = diffResumeContent(master, content);
  const measurableGain = hasMeasurableATSGain(baselineATS,ats);
  const now = new Date().toISOString();
  record.tailoredResume = content;
  record.ats = ats;
  record.truthfulness = truth;
  record.resumeVersion = { id: `resume-${record.jobId}-${stableHash(JSON.stringify(content))}`, jobId: record.jobId, company: record.company, role: record.jobTitle, createdAt: now, strategy: "TAILORED_RESUME", provider: routed.provider, model: exactModel, ...(resume ? { sourceMasterResumeId: resume.id, sourceMasterHash: resume.checksum } : {}), evidenceIds: [...new Set(content.bullets.flatMap((item) => item.sourceEvidenceIds))], changes, baselineATS, validationStatus: truth.status, atsCompatibility: ats, hash: stableHash(JSON.stringify(content)), content };
  record.recommendedResume=measurableGain?"TAILORED_RESUME":"MASTER_RESUME";
  if(!measurableGain)record.tailoringDecisionReason="TAILORING_NO_MEASURABLE_GAIN";
  record.application = prepareApplication(job, profile, measurableGain?record.resumeVersion.id:null);
  record.provenance.push({ provider: routed.provider, model: exactModel, latencyMs: routed.value.latencyMs, fallbackCount: routed.fallbackCount, aiCostUsd: 0, aiNecessary:true, task: "RESUME_TAILORING", privacyClass: "SANITIZED_CANDIDATE_DATA",entitlement:routed.provider==="nvidia"?"FREE_DEVELOPMENT_ENDPOINT":"FREE_PRODUCTION_ENDPOINT",environment:routed.provider==="nvidia"?"DEVELOPMENT_ONLY":"PRODUCTION_ALLOWED",freeVerified:true,timestamp:now },...(semanticProvenance?[semanticProvenance]:[]), { provider: "deterministic", model: "evidence-audit-v2", latencyMs: 0, fallbackCount: 0, aiCostUsd: 0, aiNecessary:true, task: "TRUTHFULNESS_REVIEW", privacyClass: "SANITIZED_CANDIDATE_DATA",freeVerified:true,timestamp:now });
  record.transitions.push({ state: "TAILORED", at: now, agent: "ResumeAgent", reason: "Verified-free AI produced evidence-linked structured content." }, { state: "ATS_VALIDATING", at: now, agent: "ATSAgent", reason: "Compared ATS compatibility before and after tailoring." }, { state: "TRUTHFULNESS_VALIDATING", at: now, agent: "TruthfulnessAgent", reason: "Deterministic evidence audit passed." });
  record.state = record.reviewReasons.length || record.application.status === "NEEDS_REVIEW" ? "NEEDS_REVIEW" : "APPLICATION_PREPARED";
  record.reviewReasons = [...new Set([...record.reviewReasons, ...record.application.reviewReasons])];
  record.updatedAt = now;
  record.completedAt = now;
  return record;
}

export { WaitingForFreeAIError };
