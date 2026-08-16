/**
 * Support — "get help", AI-first with a human fallback.
 *
 * Three layers, one screen (see data/supportKB.ts + core/supportAI.ts):
 *   1. Type a question → instant answers from the offline knowledge base.
 *   2. If a live Claude endpoint is configured, an AI answer grounded in those
 *      same articles (dormant until phase 2 wires the endpoint).
 *   3. Still stuck → "Email support", pre-filled with the question and context,
 *      so a solo support person can reply without a back-and-forth.
 * With no query it's a browsable help centre grouped by category.
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { theme } from '../core/theme';
import { Card, TextField, Button, LoadingState, EmptyState, textStyles } from '../components/ui';
import { Markdown } from '../components/Markdown';
import { useAuth } from '../core/auth';
import { SUPPORT_EMAIL, submitSupportCase } from '../data/repos';
import {
  searchArticles,
  articlesByCategory,
  buildSupportMailto,
  CATEGORY_ICON,
  type Article,
} from '../data/supportKB';
import { getGuide } from '../data/supportGuides';
import { askSupport, enabled as aiEnabled, type SupportAnswer } from '../core/supportAI';

/** A tappable article row that expands to show the full body inline. */
function ArticleCard({ article, defaultOpen }: { article: Article; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [showGuide, setShowGuide] = useState(false);
  const guide = getGuide(article.id);
  return (
    <Card style={{ gap: theme.spacing(2) }}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={article.title}
        accessibilityState={{ expanded: open }}
        activeOpacity={0.75}
        onPress={() => setOpen((o) => !o)}
        style={st.artHead}
      >
        <View style={{ flex: 1 }}>
          <Text style={[textStyles.body, { fontWeight: '700' }]}>{article.title}</Text>
          {!open && <Text style={textStyles.muted} numberOfLines={2}>{article.summary}</Text>}
        </View>
        <Text style={st.caret}>{open ? '▴' : '▾'}</Text>
      </TouchableOpacity>
      {open && (
        <>
          {/* Short answer, then an optional expander for the long-form guide. */}
          {showGuide && guide ? <Markdown content={guide} /> : <Markdown content={article.body} />}
          {guide && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={showGuide ? 'Hide the full guide' : 'Read the full guide'}
              accessibilityState={{ expanded: showGuide }}
              activeOpacity={0.75}
              onPress={() => setShowGuide((g) => !g)}
              style={st.guideToggle}
            >
              <Text style={st.guideToggleText}>{showGuide ? '▴  Show less' : '📖  Read the full guide'}</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </Card>
  );
}

export default function SupportScreen() {
  const { profile } = useAuth();
  const [query, setQuery] = useState('');
  const version = Constants.expoConfig?.version ?? '1.0.0';

  // AI answer (only when an endpoint is configured — dormant in demo/phase 1).
  const [aiAnswer, setAiAnswer] = useState<SupportAnswer | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAsked, setAiAsked] = useState(false);

  const trimmed = query.trim();
  const results = useMemo(() => (trimmed ? searchArticles(trimmed) : []), [trimmed]);
  const groups = useMemo(() => articlesByCategory(), []);

  const [sent, setSent] = useState(false);
  const escalate = async () => {
    const question = trimmed || 'I need help with SportnNote';
    const triedSummary = aiAnswer ? 'AI assistant (unresolved)' : results.length ? results.map((r) => r.article.title).slice(0, 3).join('; ') : undefined;
    // Live mode records the case + emails support server-side; if that isn't
    // wired (demo, or email not configured yet) fall back to a pre-filled email.
    const { delivered } = await submitSupportCase({ question, tried: triedSummary, handle: profile?.handle, appVersion: version });
    if (delivered) {
      setSent(true);
      return;
    }
    void Linking.openURL(buildSupportMailto(SUPPORT_EMAIL, { question, triedSummary, handle: profile?.handle, appVersion: version }));
  };

  const askAI = async () => {
    if (!aiEnabled() || !trimmed) return;
    setAiLoading(true);
    setAiAsked(true);
    const context = results.map((r) => `${r.article.title}\n${r.article.body}`).join('\n\n---\n\n');
    const ans = await askSupport(trimmed, context, version);
    setAiAnswer(ans);
    setAiLoading(false);
  };

  const onChangeQuery = (v: string) => {
    setQuery(v);
    // A new question invalidates any previous AI answer.
    setAiAnswer(null);
    setAiAsked(false);
  };

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <View style={{ gap: theme.spacing(1) }}>
          <Text style={textStyles.h2}>How can we help?</Text>
          <Text style={textStyles.muted}>Search our help guides, or email us and we'll get back to you.</Text>
        </View>

        <TextField
          label=""
          value={query}
          onChange={onChangeQuery}
          placeholder="Ask a question — e.g. “how do I undo a mistake?”"
          autoCapitalize="none"
        />

        {trimmed.length > 0 ? (
          <View style={{ gap: theme.spacing(3) }}>
            {/* Layer 2: AI answer, when a live endpoint is configured. */}
            {aiEnabled() && (
              aiLoading ? (
                <LoadingState label="Asking the assistant…" />
              ) : aiAnswer ? (
                <Card style={{ gap: theme.spacing(2) }}>
                  <Text style={st.aiTag}>🤖 Assistant</Text>
                  <Markdown content={aiAnswer.answer} />
                </Card>
              ) : !aiAsked ? (
                <Button label="🤖 Ask the assistant" onPress={askAI} />
              ) : null
            )}

            {results.length > 0 ? (
              <>
                <Text style={st.sectionLabel}>{results.length} help guide{results.length === 1 ? '' : 's'}</Text>
                {results.map((r, i) => (
                  <ArticleCard key={r.article.id} article={r.article} defaultOpen={i === 0} />
                ))}
              </>
            ) : (
              <Card>
                <Text style={textStyles.body}>No guide matched that.</Text>
                <Text style={textStyles.muted}>Try different words, or email us directly below.</Text>
              </Card>
            )}

            {/* Layer 3: escalation — always available once they've asked. */}
            <Card style={{ gap: theme.spacing(2), backgroundColor: theme.colors.surfaceAlt }}>
              {sent ? (
                <EmptyState icon="✅" title="Sent to support" hint="We've got your question and will reply by email." compact />
              ) : (
                <>
                  <Text style={[textStyles.body, { fontWeight: '700' }]}>Still stuck?</Text>
                  <Text style={textStyles.muted}>
                    Contact our support team. We'll include your question and app details so we can help faster.
                  </Text>
                  <Button label="✉️  Contact support" onPress={() => void escalate()} />
                </>
              )}
            </Card>
          </View>
        ) : (
          <View style={{ gap: theme.spacing(4) }}>
            {groups.map((g) => (
              <View key={g.category} style={{ gap: theme.spacing(2) }}>
                <Text style={st.sectionLabel}>{CATEGORY_ICON[g.category]}  {g.category}</Text>
                {g.articles.map((a) => (
                  <ArticleCard key={a.id} article={a} />
                ))}
              </View>
            ))}

            <Card style={{ gap: theme.spacing(2), backgroundColor: theme.colors.surfaceAlt }}>
              {sent ? (
                <EmptyState icon="✅" title="Sent to support" hint="We've got your question and will reply by email." compact />
              ) : (
                <>
                  <Text style={[textStyles.body, { fontWeight: '700' }]}>Can't find an answer?</Text>
                  <Text style={textStyles.muted}>Contact us and we'll help.</Text>
                  <Button label="✉️  Contact support" variant="ghost" onPress={() => void escalate()} />
                </>
              )}
            </Card>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(4) },
  sectionLabel: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  artHead: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  caret: { color: theme.colors.textMuted, fontSize: 18 },
  aiTag: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
  guideToggle: { alignSelf: 'flex-start', paddingVertical: theme.spacing(1) },
  guideToggleText: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
});
