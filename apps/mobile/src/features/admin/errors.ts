/** Friendly text for the refusals the admin RPCs raise. Never echoes server text or ids. */
export function friendlyAdminError(error: unknown): string {
  const e = (error ?? {}) as { code?: string; message?: string };
  const msg = (e.message ?? '').toLowerCase();
  if (msg.includes('your own branch')) return 'You cannot change your own branch.';
  if (msg.includes('already in that branch')) return 'The member is already in that branch.';
  if (msg.includes('cannot be moved')) {
    return 'Only active, pending or suspended members can be moved to another branch.';
  }
  if (msg.includes('unknown member') || msg.includes('unknown branch')) {
    return 'That member or branch could not be found.';
  }
  if (e.code === '42501') {
    return 'You do not have permission to do that. Moving a member needs member management in their current branch and approval rights in the new one.';
  }
  return 'Something went wrong. Please try again.';
}
