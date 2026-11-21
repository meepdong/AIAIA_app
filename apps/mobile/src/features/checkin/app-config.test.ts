import config from '../../../app.config';

describe('app.config', () => {
  it('turns Android Auto Backup off: the check-in database must not go to Google Drive', () => {
    expect(config.android?.allowBackup).toBe(false);
  });
});
