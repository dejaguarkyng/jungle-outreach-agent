import { z } from "zod";
import { MAX_SUBJECT_LENGTH } from "@/packages/shared/src/constants";

export {
  ALLOWED_OUTREACH_LINKS,
  JUNGLEGRID_SITE as ALLOWED_LINK,
  countWords,
  extractLinks,
  validateArtifactDraft,
  validateDraftContent,
  validateEmailDraftArtifact,
  type DraftValidation,
} from "@/packages/shared/src";

import { validateDraftContent } from "@/packages/shared/src";

export const editableDraftSchema = z
  .object({
    subject: z.string().trim().min(1).max(MAX_SUBJECT_LENGTH),
    body: z.string().trim().min(1),
  })
  .superRefine((value, ctx) => {
    for (const error of validateDraftContent(value.subject, value.body).errors) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
    }
  });

export function assertDraftContent(subject: string, body: string) {
  const result = validateDraftContent(subject, body);
  if (!result.valid) throw new Error(result.errors.join(" "));
  return result;
}
