import type { CandidateProfile } from "@rolevana/domain";

export function profileAfterResumeUpload(current: CandidateProfile | undefined, response: { mergedProfile?: CandidateProfile }): CandidateProfile | undefined {
  return response.mergedProfile ?? current;
}
