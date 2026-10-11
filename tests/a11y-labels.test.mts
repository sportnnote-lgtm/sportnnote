/**
 * SD-155 — accessibility lint for the core flows (WCAG 2.1 AA 4.1.2 Name, Role,
 * Value; 2.1.1 Keyboard). Parses every TSX file in the core set and checks each
 * pressable — <TouchableOpacity|TouchableHighlight|TouchableWithoutFeedback|
 * Pressable> and <Text onPress> — for:
 *   1. a role (accessibilityRole / role) — without it VoiceOver/TalkBack don't
 *      say "button", and on the web Space does nothing;
 *   2. a name — accessibilityLabel / aria-label, or a visible text child that
 *      has a letter or digit (a bare "✕" / "↺" / "›" is not a name).
 * A `{...props}` spread is trusted (the caller passes the props).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = path.resolve(import.meta.dirname, '..');

/** The core flows: auth, home, live scoring + every sport's controls, standings /
 *  bracket / journey, player + tournament pages, results entry. */
const CORE_FILES = [
  'src/components/ui.tsx',
  'src/components/ConfirmSheet.tsx',
  'src/components/BoxScore.tsx',
  'src/components/Scoreboard.tsx',
  'src/components/MiniScore.tsx',
  'src/components/MatchHeader.tsx',
  'src/components/MatchCard.tsx',
  'src/components/LineScoreboard.tsx',
  'src/components/LeagueTable.tsx',
  'src/components/PhoneField.tsx',
  'src/components/PhoneLoginCard.tsx',
  'src/components/ProfileView.tsx',
  'src/components/GameFlowCard.tsx',
  'src/components/FormStrip.tsx',
  'src/components/MatchSummary.tsx',
  'src/components/DivisionTabs.tsx',
  'src/components/TournamentHistory.tsx',
  'src/components/LiveAnnouncer.tsx',
  'src/screens/AuthScreen.tsx',
  'src/screens/HomeScreen.tsx',
  'src/screens/LiveScoringScreen.tsx',
  'src/screens/StandingsScreen.tsx',
  'src/screens/BracketScreen.tsx',
  'src/screens/TeamJourneyScreen.tsx',
  'src/screens/PlayerProfileScreen.tsx',
  'src/screens/SportProfileScreen.tsx',
  'src/screens/TournamentProfileScreen.tsx',
  'src/screens/ResultsEventScreen.tsx',
];
/** Whole directories in the core set (results-entry panels, shared scoring pieces). */
const CORE_DIRS = ['src/components/results', 'src/components/athletics', 'src/components/golf'];
/** Sports audited in SD-155. A sport added later joins once it has had its pass. */
const AUDITED_SPORTS = [
  'archery', 'athletics', 'badminton', 'basketball', 'canoe', 'carrom', 'chess', 'cricket', 'cycling',
  'football', 'golf', 'handball', 'hockey', 'ice_hockey', 'kabaddi', 'padel', 'pickleball', 'rowing', 'rugby', 'shooting',
  'squash', 'swimming', 'tabletennis', 'tennis', 'volleyball', 'weightlifting',
  'netball', // SD-146
  'baseball', // SD-144
  'american_football', // SD-147
];

function coreFiles(): string[] {
  const out = new Set(CORE_FILES.filter((f) => fs.existsSync(path.join(ROOT, f))));
  const tsxIn = (dir: string) => {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) return;
    for (const f of fs.readdirSync(abs)) if (f.endsWith('.tsx')) out.add(`${dir}/${f}`);
  };
  CORE_DIRS.forEach(tsxIn);
  tsxIn('src/sports'); // shared scoring pieces: PointButtons, TimelineControls, MatchStatsPanel, …
  for (const sp of AUDITED_SPORTS) tsxIn(`src/sports/${sp}`);
  return [...out].sort();
}

const LABELLED_COMPONENTS = new Set(['Button', 'SelectChip', 'SecondaryAction']);
const PRESSABLE = new Set(['TouchableOpacity', 'TouchableHighlight', 'TouchableWithoutFeedback', 'Pressable']);

type Finding = { at: string; problem: string };

function textOf(node: ts.Node, sf: ts.SourceFile): { dynamic: boolean; literal: string } {
  let dynamic = false;
  let literal = '';
  const walk = (n: ts.Node) => {
    if (ts.isJsxText(n)) literal += n.getText(sf);
    else if (ts.isJsxExpression(n) && n.expression) {
      // {'literal'} counts as literal text; anything else is dynamic text (a name, a score…)
      if (ts.isStringLiteral(n.expression) || ts.isNoSubstitutionTemplateLiteral(n.expression)) literal += n.expression.text;
      else dynamic = true;
      return;
    }
    ts.forEachChild(n, walk);
  };
  if (ts.isJsxElement(node)) node.children.forEach(walk);
  return { dynamic, literal };
}

/** a child component that renders its own text (<Text>, <Button label>, <Pill>…) */
function hasTextChild(node: ts.Node, sf: ts.SourceFile): boolean {
  let found = false;
  const walk = (n: ts.Node) => {
    if (found) return;
    const open = ts.isJsxElement(n) ? n.openingElement : ts.isJsxSelfClosingElement(n) ? n : null;
    if (open) {
      const tag = open.tagName.getText(sf);
      if (tag === 'Text' || tag === 'Animated.Text') {
        const t = textOf(n, sf);
        if (t.dynamic || /[\p{L}\p{N}]/u.test(t.literal)) { found = true; return; }
      } else if (tag !== 'TextInput' && /^[A-Z]/.test(tag) && !['View', 'Image', 'Animated.View', 'Svg', 'Path', 'Circle', 'Line', 'Rect', 'G'].includes(tag)
        && open.attributes.properties.some((p) => ts.isJsxAttribute(p) && ['label', 'name', 'title', 'children'].includes(p.name.getText(sf)))) {
        found = true; return;
      }
    }
    ts.forEachChild(n, walk);
  };
  if (ts.isJsxElement(node)) node.children.forEach(walk);
  return found;
}

function scan(file: string): Finding[] {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: Finding[] = [];
  const visit = (n: ts.Node) => {
    const open = ts.isJsxElement(n) ? n.openingElement : ts.isJsxSelfClosingElement(n) ? n : null;
    if (open) {
      const tag = open.tagName.getText(sf);
      const props = open.attributes.properties.map((p) => (ts.isJsxAttribute(p) ? p.name.getText(sf) : '...'));
      const spread = props.includes('...');
      const isText = tag === 'Text' && props.includes('onPress');
      // 3. the shared <Button>/<SelectChip>/<SecondaryAction>: a symbol-only label ("✕", "‹", "−")
      //    needs an accessibilityLabel (they read `label` otherwise).
      if (LABELLED_COMPONENTS.has(tag) && !spread && !props.includes('accessibilityLabel')) {
        const lab = open.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText(sf) === 'label') as ts.JsxAttribute | undefined;
        const init = lab?.initializer;
        const literal = init && ts.isStringLiteral(init) ? init.text
          : init && ts.isJsxExpression(init) && init.expression && (ts.isStringLiteral(init.expression) || ts.isNoSubstitutionTemplateLiteral(init.expression)) ? init.expression.text : null;
        if (literal != null && !/[\p{L}\p{N}]/u.test(literal)) {
          out.push({ at: `${file}:${sf.getLineAndCharacterOfPosition(open.getStart(sf)).line + 1} <${tag} label="${literal}">`, problem: 'symbol-only label needs accessibilityLabel' });
        }
      }
      if ((PRESSABLE.has(tag) || isText) && !spread) {
        const at = `${file}:${sf.getLineAndCharacterOfPosition(open.getStart(sf)).line + 1} <${tag}>`;
        if (!props.includes('accessibilityRole') && !props.includes('role')) out.push({ at, problem: 'no accessibilityRole' });
        // a non-interactive wrapper (a sheet that only swallows taps) needs no name
        const roleNone = open.attributes.properties.some((p) => ts.isJsxAttribute(p) && ['accessibilityRole', 'role'].includes(p.name.getText(sf))
          && p.initializer && ts.isStringLiteral(p.initializer) && p.initializer.text === 'none');
        const labelled = roleNone || props.includes('accessibilityLabel') || props.includes('aria-label') || props.includes('aria-labelledby');
        if (!labelled) {
          const own = textOf(n, sf);
          const named = isText
            ? own.dynamic || /[\p{L}\p{N}]/u.test(own.literal) || hasTextChild(n, sf)
            : hasTextChild(n, sf);
          if (!named) out.push({ at, problem: 'no accessibilityLabel and no visible word/number' });
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

test('core flows: every pressable has a role and an accessible name', () => {
  const files = coreFiles();
  assert.ok(files.length > 60, `core set unexpectedly small (${files.length})`);
  const findings = files.flatMap(scan);
  assert.deepEqual(findings.map((f) => `${f.at}: ${f.problem}`), []);
});

test('scanner catches an unlabelled icon button and a role-less text link', () => {
  const tmp = path.join(ROOT, 'tests', '.a11y-fixture.tsx');
  fs.writeFileSync(tmp, [
    'export const A = () => <TouchableOpacity onPress={f}><Text>✕</Text></TouchableOpacity>;',
    'export const B = () => <Text onPress={f}>Cancel</Text>;',
    'export const C = () => <TouchableOpacity accessibilityRole="button" onPress={f}><Text>Save</Text></TouchableOpacity>;',
    'export const D = () => <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={f}><Text>✕</Text></Pressable>;',
    'export const E = () => <Button label="✕" onPress={f} />;',
    'export const F = () => <SelectChip label="✕" accessibilityLabel="Remove" active={false} onPress={f} />;',
  ].join('\n'));
  try {
    const got = scan('tests/.a11y-fixture.tsx').map((f) => `${f.at.split(':')[1]} ${f.problem}`);
    assert.deepEqual(got, [
      '1 <TouchableOpacity> no accessibilityRole',
      '1 <TouchableOpacity> no accessibilityLabel and no visible word/number',
      '2 <Text> no accessibilityRole',
      '5 <Button label="✕"> symbol-only label needs accessibilityLabel',
    ]);
  } finally {
    fs.unlinkSync(tmp);
  }
});
