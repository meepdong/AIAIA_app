import { Platform, Share } from 'react-native';
import { deliverCsv } from './members/deliverCsv';

describe('deliverCsv', () => {
  it('has no native share path: it refuses and never opens the share sheet', async () => {
    const share = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: 'sharedAction', activityType: undefined });
    expect(Platform.OS).not.toBe('web');
    await expect(deliverCsv('x.csv', 'a,b')).rejects.toThrow(/web console only/);
    expect(share).not.toHaveBeenCalled();
    share.mockRestore();
  });
});
