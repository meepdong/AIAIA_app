import type { DirectoryEntry } from '@aiaia/shared/src/schemas/content';
import { Avatar, Button, Card, Text } from '@aiaia/ui';
import { Linking, View } from 'react-native';
import { telUrl, whatsappUrl } from './contact';
import { ReportMember } from './ReportMember';

/** City and occupation are null when the member hides them; skip the gaps. */
export function cardSubtitle(entry: DirectoryEntry): string {
  return [entry.branch_name, entry.city, entry.occupation].filter(Boolean).join(' · ');
}

/**
 * One directory row. Call and WhatsApp show only when the RPC returned a phone; it returns null
 * for minors and for members who keep their number private, so there is nothing to show then.
 * `photo_path` is a private storage path, so the avatar shows initials until media signing lands.
 */
export function MemberCard({ entry }: { entry: DirectoryEntry }) {
  const { phone } = entry;
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={entry.full_name} size={48} />
        <View style={{ flex: 1 }}>
          <Text bold>{entry.full_name}</Text>
          <Text variant="label" tone="textMuted">
            {cardSubtitle(entry)}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {phone ? (
          <>
            <Button
              title="Call"
              variant="secondary"
              accessibilityLabel={`Call ${entry.full_name}`}
              onPress={() => void Linking.openURL(telUrl(phone))}
            />
            <Button
              title="WhatsApp"
              variant="secondary"
              accessibilityLabel={`WhatsApp ${entry.full_name}`}
              onPress={() => void Linking.openURL(whatsappUrl(phone))}
            />
          </>
        ) : null}
        <ReportMember memberId={entry.id} name={entry.full_name} />
      </View>
    </Card>
  );
}
