/**
 * Markdown — a tiny, dependency-free renderer for our help content.
 *
 * We deliberately avoid a markdown library: the help copy (KB bodies in
 * `data/supportKB.ts` and the long-form guides in `data/supportGuides.ts`) only
 * uses a small, known subset, and shipping a parser + its transitive deps for
 * that would be overkill on React Native. This handles exactly what our content
 * uses and nothing more:
 *
 *   ## Heading            → section heading
 *   ### Subheading        → smaller heading
 *   - bullet              → bulleted list item
 *   1. step               → numbered list item
 *   **bold** inline       → bold span (anywhere in a line)
 *   blank line            → paragraph break
 *   everything else       → body paragraph
 *
 * Consecutive list lines group into one list; a stray intro line above a list
 * ("You can:") renders as its own paragraph, so lists never leak literal "- ".
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { textStyles } from './ui';

/** Split a line on **bold** markers into styled spans. */
function renderInline(line: string, keyPrefix: string) {
  // Split keeps the delimited chunks; odd indices were wrapped in ** **.
  const parts = line.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <Text key={`${keyPrefix}-b${i}`} style={md.bold}>
        {part}
      </Text>
    ) : (
      <Text key={`${keyPrefix}-t${i}`}>{part}</Text>
    ),
  );
}

type Block =
  | { kind: 'h2' | 'h3' | 'p'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] };

/** Group raw lines into renderable blocks. */
function parse(content: string): Block[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      blocks.push({ kind: 'p', text: para.join(' ') });
      para = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (trimmed === '') {
      flushPara();
      continue;
    }
    if (trimmed.startsWith('### ')) {
      flushPara();
      blocks.push({ kind: 'h3', text: trimmed.slice(4) });
      continue;
    }
    if (trimmed.startsWith('## ')) {
      flushPara();
      blocks.push({ kind: 'h2', text: trimmed.slice(3) });
      continue;
    }
    const bullet = trimmed.match(/^-\s+(.*)$/);
    if (bullet) {
      flushPara();
      const last = blocks[blocks.length - 1];
      if (last && last.kind === 'ul') last.items.push(bullet[1]);
      else blocks.push({ kind: 'ul', items: [bullet[1]] });
      continue;
    }
    const ordered = trimmed.match(/^\d+\.\s+(.*)$/);
    if (ordered) {
      flushPara();
      const last = blocks[blocks.length - 1];
      if (last && last.kind === 'ol') last.items.push(ordered[1]);
      else blocks.push({ kind: 'ol', items: [ordered[1]] });
      continue;
    }
    para.push(trimmed);
  }
  flushPara();
  return blocks;
}

export function Markdown({ content }: { content: string }) {
  const blocks = React.useMemo(() => parse(content), [content]);
  return (
    <View style={{ gap: theme.spacing(2) }}>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'h2':
            return (
              <Text key={i} style={md.h2}>
                {renderInline(b.text, `h2${i}`)}
              </Text>
            );
          case 'h3':
            return (
              <Text key={i} style={md.h3}>
                {renderInline(b.text, `h3${i}`)}
              </Text>
            );
          case 'ul':
            return (
              <View key={i} style={{ gap: theme.spacing(1) }}>
                {b.items.map((item, j) => (
                  <View key={j} style={md.row}>
                    <Text style={md.dot}>•</Text>
                    <Text style={md.itemText}>{renderInline(item, `ul${i}-${j}`)}</Text>
                  </View>
                ))}
              </View>
            );
          case 'ol':
            return (
              <View key={i} style={{ gap: theme.spacing(1) }}>
                {b.items.map((item, j) => (
                  <View key={j} style={md.row}>
                    <Text style={md.num}>{j + 1}.</Text>
                    <Text style={md.itemText}>{renderInline(item, `ol${i}-${j}`)}</Text>
                  </View>
                ))}
              </View>
            );
          default:
            return (
              <Text key={i} style={md.p}>
                {renderInline(b.text, `p${i}`)}
              </Text>
            );
        }
      })}
    </View>
  );
}

const md = StyleSheet.create({
  p: { ...textStyles.body, color: theme.colors.textMuted },
  bold: { fontWeight: '700', color: theme.colors.text },
  h2: { ...textStyles.body, fontWeight: '800', color: theme.colors.text, marginTop: theme.spacing(1) },
  h3: { ...textStyles.body, fontWeight: '700', color: theme.colors.text },
  row: { flexDirection: 'row', gap: theme.spacing(2), alignItems: 'flex-start' },
  dot: { color: theme.colors.primary, fontSize: theme.font.body, lineHeight: 20 },
  num: { color: theme.colors.primary, fontSize: theme.font.body, lineHeight: 20, fontWeight: '700', minWidth: 18 },
  itemText: { ...textStyles.body, flex: 1, color: theme.colors.textMuted },
});

export default Markdown;
