/** Friendly text for the refusals the admin RPCs raise. Never echoes server text or ids. */
export function friendlyAdminError(error: unknown): string {
  const e = (error ?? {}) as { code?: string; message?: string };
  const msg = (e.message ?? '').toLowerCase();

  // Branch moves.
  if (msg.includes('your own branch')) return 'You cannot change your own branch.';
  if (msg.includes('already in that branch')) return 'The member is already in that branch.';
  if (msg.includes('cannot be moved')) {
    return 'Only active, pending or suspended members can be moved to another branch.';
  }
  if (msg.includes('members.manage for the current branch')) {
    return 'You do not have permission to do that. Moving a member needs member management in their current branch and approval rights in the new one.';
  }

  // Roles.
  if (msg.includes('assign a role to yourself')) {
    return 'You cannot assign a role to yourself. Ask another office-bearer to do it.';
  }
  if (msg.includes('global roles need system.config')) {
    return 'Global roles can only be assigned or ended by someone with system configuration rights.';
  }
  if (msg.includes('roles.assign is required')) {
    return 'You do not have permission to assign or end roles.';
  }
  if (msg.includes('unknown role')) return 'That role could not be found.';
  if (msg.includes('unknown assignment')) return 'That role assignment could not be found.';
  if (msg.includes('only an active member')) return 'Only an active member can hold a role.';
  if (msg.includes('only for a member of that branch')) {
    return 'A branch role can only go to a member of that branch.';
  }
  if (msg.includes('overlapping term')) {
    return 'This member already holds that role for an overlapping term.';
  }
  if (msg.includes('last super admin')) return 'The last super admin cannot be removed.';
  if (msg.includes('already ends by that date')) return 'That role has already ended.';
  if (msg.includes('starts_on cannot be in the past'))
    return 'The start date cannot be in the past.';
  if (msg.includes('ends_on must be on or after')) {
    return 'The end date must be on or after the start date.';
  }
  if (msg.includes('ends_on cannot be before')) return 'The end date cannot be before yesterday.';

  // Settings.
  if (msg.includes('secret settings cannot be changed')) {
    return 'Secret settings cannot be changed here.';
  }
  if (msg.includes('this setting cannot be changed here')) {
    return 'This setting is locked and cannot be changed here.';
  }
  if (msg.includes('unknown setting')) return 'That setting could not be found.';
  if (msg.includes('limited to 10000'))
    return 'That value is too long (at most 10,000 characters).';
  if (msg.includes('expects a json')) return 'That value is the wrong type for this setting.';
  if (msg.includes('system.config is required')) {
    return 'You do not have permission to change settings.';
  }
  if (e.code === '23514' && msg.includes('step_up_roles')) {
    return 'The step-up roles list must stay a list that includes super_admin.';
  }

  // Shared.
  if (msg.includes('unknown member') || msg.includes('unknown branch')) {
    return 'That member or branch could not be found.';
  }
  if (e.code === '42501') return 'You do not have permission to do that.';
  if (e.code === '22023') return 'That value is not valid. Please check it and try again.';
  if (e.code === '23514') return 'That change is not allowed.';
  return 'Something went wrong. Please try again.';
}
