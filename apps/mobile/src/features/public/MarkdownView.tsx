import { Text as RNText, View } from 'react-native';
import { Text } from '@aiaia/ui';
import { parseMarkdown, type Inline } from './markdown';

function Inlines({ inline }: { inline: Inline[] }) {
  return (
    <>
      {inline.map((part, i) => {
        if (part.placeholder) {
          return (
            <Text key={i} tone="warning" bold>
              {part.text}
            </Text>
          );
        }
        return part.bold ? (
          <RNText key={i} style={{ fontWeight: '600' }}>
            {part.text}
          </RNText>
        ) : (
          part.text
        );
      })}
    </>
  );
}

/** Renders the Markdown subset from `./markdown` with the design-system text styles. */
export function MarkdownView({ source }: { source: string }) {
  const blocks = parseMarkdown(source);
  return (
    <View style={{ gap: 12 }}>
      {blocks.map((block, i) => {
        if (block.type === 'heading') {
          const variant = block.level === 1 ? 'title' : block.level === 2 ? 'heading' : 'body';
          return (
            <Text key={i} variant={variant} bold accessibilityRole="header">
              <Inlines inline={block.inline} />
            </Text>
          );
        }
        if (block.type === 'paragraph') {
          return (
            <Text key={i}>
              <Inlines inline={block.inline} />
            </Text>
          );
        }
        return (
          <View key={i} style={{ gap: 6 }}>
            {block.items.map((item, j) => (
              <View key={j} style={{ flexDirection: 'row', gap: 8 }}>
                <Text accessibilityElementsHidden importantForAccessibility="no">
                  {block.ordered ? `${j + 1}.` : '•'}
                </Text>
                <Text style={{ flex: 1 }}>
                  <Inlines inline={item} />
                </Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}
