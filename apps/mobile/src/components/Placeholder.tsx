import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Stand-in body for screens that later briefs build. Replaced by P0-04 components. */
export function Placeholder({ title, note }: { title: string; note?: string }) {
  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 items-center justify-center gap-2 px-6">
        <Text accessibilityRole="header" className="text-2xl font-semibold text-slate-900">
          {title}
        </Text>
        {note ? <Text className="text-center text-base text-slate-600">{note}</Text> : null}
      </View>
    </SafeAreaView>
  );
}
