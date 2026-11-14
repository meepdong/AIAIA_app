import type { Api } from '@aiaia/api';
import { validateStep, type FieldErrors, type ProfileDraft } from './form';

type UpdateProfileInput = Parameters<Api['profile']['updateProfile']>[0];

/** Errors for the fields My profile lets the member change (the DOB and branch are read-only). */
export function validateEdit(draft: ProfileDraft): FieldErrors {
  const errors: FieldErrors = {
    ...validateStep(0, draft),
    ...validateStep(1, draft),
  };
  delete errors.dob;
  delete errors.branchId;
  // Email is shown but cannot be changed here.
  delete errors.email;
  return errors;
}

const blankToNull = (value: string) => (value.trim() ? value.trim() : null);

/** The whitelisted update. Email, DOB and branch are not part of it. */
export function toUpdateInput(draft: ProfileDraft, memberId: string): UpdateProfileInput {
  return {
    memberId,
    fullName: draft.fullName.trim(),
    gender: blankToNull(draft.gender),
    city: blankToNull(draft.city),
    occupation: blankToNull(draft.occupation),
    education: blankToNull(draft.education),
    emergencyContactName: blankToNull(draft.emergencyName),
    emergencyContactPhone: draft.emergencyPhone ? `+91${draft.emergencyPhone}` : null,
    whatsappOptIn: draft.whatsappOptIn,
    emailUpdatesOptIn: draft.emailUpdatesOptIn,
    privacy: { ...draft.privacy },
  };
}
