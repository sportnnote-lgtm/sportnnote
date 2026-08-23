/** Data-driven player profile, shared by the Profile tab and PlayerProfile
 *  screen. Stays concise: header, follow, overall stats, and a tappable
 *  per-sport list. Deep per-sport stats/details live on SportProfileScreen. */
import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Card, Pill, Button, SelectChip, EmptyState, textStyles, plural } from './ui';
import { SectionHeader, SECTION_CAP } from './SectionHeader';
import { ContactCard } from './ContactCard';
import { usePlayerProfile, useOrganizations } from '../data/hooks';
import { updatePlayer, verifyGuardianContact, submitVerificationDoc, SUPPORT_EMAIL } from '../data/repos';
import { pickPhoto } from '../core/photo';
import { pickDocument } from '../core/document';
import { ageFromDob, isMinor } from '../core/age';
import { notify } from '../core/notifications';
import { activeOrgsForPlayer, pastOrgsForPlayer, roleInOrg, memberEntry, membershipPeriod, isAcademicCommunity, currentStandard } from '../core/org';
import { teamsByRecency, teamPeriod, type TeamAffiliation } from '../core/teams';
import { getSport } from '../sports/registry';
import { sportSummary, hasPartialCoverage } from '../data/stats';
import type { Player, SportId } from '../core/types';

export function ProfileView({
  playerId,
  follow,
  onOpenSport,
  onEditProfile,
  onOpenOrg,
  onOpenSettings,
  onCreateProfile,
  creating,
  onSignOut,
}: {
  playerId: string | null;
  follow?: { following: boolean; onToggle: () => void };
  /** open the dedicated per-sport profile page */
  onOpenSport?: (sport: SportId) => void;
  /** own profile: edit your own details */
  onEditProfile?: () => void;
  /** open an organization the player belongs to */
  onOpenOrg?: (orgId: string) => void;
  /** own profile: open the Settings home (preferences, account, sign out) */
  onOpenSettings?: () => void;
  /** own profile with no player yet: create it (first-time setup) */
  onCreateProfile?: () => void;
  /** true while the player profile is being created */
  creating?: boolean;
  /** own profile: sign out of the account */
  onSignOut?: () => void;
}) {
  const { player, stats: allStats, official, friendly } = usePlayerProfile(playerId);
  const orgs = useOrganizations();
  const [scope, setScope] = useState<'all' | 'official' | 'friendly'>('all');
  const [photo, setPhoto] = useState<string | undefined>(undefined);
  // Inline "See all" toggles — each record-list section shows 5, then expands.
  const [showSports, setShowSports] = useState(false);
  const [showTeams, setShowTeams] = useState(false);
  const [showComm, setShowComm] = useState(false);
  const [showPastComm, setShowPastComm] = useState(false);
  useEffect(() => setPhoto(player?.photoUrl), [player?.photoUrl]);
  const changePhoto = async () => {
    if (!player) return;
    const uri = await pickPhoto();
    if (!uri) return;
    setPhoto(uri);
    await updatePlayer(player.id, { photoUrl: uri });
  };

  if (!player || !allStats || !official || !friendly) {
    // Own account with no player yet (a fresh sign-up): make this actionable —
    // set up the profile, reach Settings, or sign out — instead of a dead-end.
    // Viewing someone else with no profile just shows the neutral empty state.
    const owner = !!(onCreateProfile || onSignOut);
    return (
      <ScrollView contentContainerStyle={st.content}>
        <View style={st.emptyBlock}>
          <EmptyState
            icon="🙋"
            title={owner ? 'Set up your profile' : 'No player profile found'}
            hint={owner
              ? 'Add your name, contact, location and the sports you play — so teams and organizers can find you.'
              : 'This account doesn’t have a player profile yet.'}
          />
          {onCreateProfile && (
            <Button label={creating ? 'Setting up…' : '✎ Set up your profile'} onPress={onCreateProfile} disabled={creating} />
          )}
          {owner && onOpenSettings && <Button label="⚙  Settings" variant="ghost" onPress={onOpenSettings} />}
          {onSignOut && <Button label="Sign out" variant="ghost" onPress={onSignOut} />}
        </View>
      </ScrollView>
    );
  }

  // Stats reflect the chosen scope. The toggle shows for anyone who has played
  // (consistent placement); an empty scope just says so.
  const hasSplit = allStats.matches > 0;
  const stats = !hasSplit ? allStats : scope === 'official' ? official : scope === 'friendly' ? friendly : allStats;
  const emptyScope = hasSplit && stats.matches === 0
    ? scope === 'friendly' ? 'No friendlies played yet.' : 'No official (tournament) matches yet.'
    : null;

  const initials = player.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  const details = player.sportDetails ?? {};

  return (
    <ScrollView contentContainerStyle={st.content}>
      <View style={st.headerRow}>
        <TouchableOpacity accessibilityRole="button" activeOpacity={onEditProfile ? 0.8 : 1} disabled={!onEditProfile} onPress={changePhoto}>
          <View style={[st.avatar, { backgroundColor: (player.houseColor ?? theme.colors.surfaceAlt) + '33', borderColor: player.houseColor ?? theme.colors.border }]}>
            {photo ? (
              <Image source={{ uri: photo }} style={st.avatarImg} />
            ) : (
              <Text style={[st.avatarText, { color: player.houseColor ?? theme.colors.primary }]}>{initials}</Text>
            )}
          </View>
          {onEditProfile && (
            <View style={st.camBadge}><Text style={st.camIcon}>📷</Text></View>
          )}
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={textStyles.h2}>
            {player.fullName}
            {player.verification?.status === 'approved' ? <Text style={st.verifiedTick}>  ☑️</Text> : null}
          </Text>
          <Text style={textStyles.muted}>
            {player.houseName ?? 'Independent'}
            {ageFromDob(player.dob) !== undefined ? ` · ${ageFromDob(player.dob)} yrs` : ''}
            {player.gender ? ` · ${player.gender}` : ''}
            {player.city ? ` · ${player.city}` : ''}
            {player.jerseyNo ? ` · #${player.jerseyNo}` : ''}
          </Text>
          <View style={st.tagRow}>
            {player.sports.map((s) => (
              <Pill key={s} label={`${getSport(s).icon} ${getSport(s).name}`} />
            ))}
          </View>
        </View>
      </View>

      {player.bio ? (
        <Card><Text style={textStyles.body}>{player.bio}</Text></Card>
      ) : null}

      {onEditProfile && (
        <Button label="✎ Edit profile" variant="ghost" onPress={onEditProfile} />
      )}
      {follow && (
        <Button
          label={follow.following ? '✓ Following' : '+ Follow player'}
          variant={follow.following ? 'ghost' : 'primary'}
          onPress={follow.onToggle}
        />
      )}

      {hasSplit && (
        <View style={st.tagRow}>
          <SelectChip label={`All · ${allStats.matches}`} active={scope === 'all'} onPress={() => setScope('all')} />
          <SelectChip label={`Official · ${official.matches}`} active={scope === 'official'} onPress={() => setScope('official')} />
          <SelectChip label={`Friendly · ${friendly.matches}`} active={scope === 'friendly'} onPress={() => setScope('friendly')} />
        </View>
      )}

      {/* The three headline boxes are sport-neutral so they're fair across every
          sport (and for players who only play friendlies). */}
      {emptyScope ? (
        <Card><Text style={textStyles.muted}>{emptyScope}</Text></Card>
      ) : (
        <View style={st.statGrid}>
          <Stat value={String(stats.matches)} label="Matches" />
          <Stat value={String(stats.wins)} label="Wins" />
          <Stat value={`${Math.round(stats.winRate * 100)}%`} label="Win rate" />
        </View>
      )}

      {onEditProfile && (player.phone || player.email) && (
        <ContactCard
          playerId={player.id}
          phone={player.phone}
          email={player.email}
          phoneVerified={player.phoneVerified}
          emailVerified={player.emailVerified}
          emailOtp
          phoneOtp
        />
      )}

      {/* Parent/guardian — shown to the profile owner (young players whose
          guardian manages the account). Verified the same way as own contact. */}
      {onEditProfile && player.guardian && (
        <ContactCard
          playerId={player.id}
          title="Parent / Guardian · only you can see this"
          name={player.guardian.name}
          phone={player.guardian.phone}
          email={player.guardian.email}
          phoneVerified={player.guardian.phoneVerified}
          emailVerified={player.guardian.emailVerified}
          verify={verifyGuardianContact}
        />
      )}

      {(onEditProfile || player.verification) && (
        <VerificationCard player={player} owner={!!onEditProfile} />
      )}

      {stats.bySport.length > 0 && (
      <SectionHeader title="By sport" count={stats.bySport.length} onSeeAll={stats.bySport.length > SECTION_CAP ? () => setShowSports((v) => !v) : undefined} expanded={showSports} />
      )}
      {stats.bySport.length > 0 && (
      <Text style={textStyles.muted}>Tap a sport for full stats &amp; details.</Text>
      )}
      {(showSports ? stats.bySport : stats.bySport.slice(0, SECTION_CAP)).map((b) => {
        const d = details[b.sport as SportId];
        const detailLine = [d?.position, ...(d?.sides ? Object.values(d.sides) : [])].filter(Boolean).join(' · ');
        const summary = sportSummary(b);
        // any surfaced stat tracked in fewer games than played → flag with a cloud
        const partial = hasPartialCoverage(stats.recent, b);
        return (
          <TouchableOpacity accessibilityRole="button" key={b.sport} activeOpacity={0.85} onPress={() => onOpenSport?.(b.sport as SportId)}>
            <Card style={st.sportRow}>
              <Text style={st.sportIcon}>{getSport(b.sport as SportId).icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={textStyles.body}>{getSport(b.sport as SportId).name}</Text>
                <Text style={textStyles.muted}>
                  {plural(b.matches, 'match', 'matches')} · {plural(b.wins, 'win')}
                </Text>
                {summary ? (
                  <Text style={st.summaryLine}>{summary}{partial ? '  ☁' : ''}</Text>
                ) : null}
                {detailLine ? <Text style={st.detailLine}>{detailLine}</Text> : null}
              </View>
              <Text style={st.chevron}>›</Text>
            </Card>
          </TouchableOpacity>
        );
      })}

      {teamsByRecency(player).length > 0 && (
        <>
          <SectionHeader title="Teams" count={teamsByRecency(player).length} onSeeAll={teamsByRecency(player).length > SECTION_CAP ? () => setShowTeams((v) => !v) : undefined} expanded={showTeams} />
          {(showTeams ? teamsByRecency(player) : teamsByRecency(player).slice(0, SECTION_CAP)).map((t) => (
            <TeamRow key={t.name} team={t} />
          ))}
        </>
      )}

      {activeOrgsForPlayer(orgs, player.id).length > 0 && (
        <>
          <SectionHeader title="Communities" count={activeOrgsForPlayer(orgs, player.id).length} onSeeAll={activeOrgsForPlayer(orgs, player.id).length > SECTION_CAP ? () => setShowComm((v) => !v) : undefined} expanded={showComm} />
          {(showComm ? activeOrgsForPlayer(orgs, player.id) : activeOrgsForPlayer(orgs, player.id).slice(0, SECTION_CAP)).map((o) => {
            const m = memberEntry(o, player.id);
            const period = membershipPeriod(m);
            const std = isAcademicCommunity(o.type) ? currentStandard(m) : undefined;
            return (
              <TouchableOpacity accessibilityRole="button" key={o.id} activeOpacity={0.85} onPress={() => onOpenOrg?.(o.id)}>
                <Card style={st.sportRow}>
                  <Text style={st.sportIcon}>🏛️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={textStyles.body}>{o.name}</Text>
                    <Text style={textStyles.muted}>
                      {[roleInOrg(o, player.id), o.type, o.city, period, std && `🎓 ${std}`].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Text style={st.chevron}>›</Text>
                </Card>
              </TouchableOpacity>
            );
          })}
        </>
      )}

      {pastOrgsForPlayer(orgs, player.id).length > 0 && (
        <>
          <SectionHeader title="Past communities" count={pastOrgsForPlayer(orgs, player.id).length} onSeeAll={pastOrgsForPlayer(orgs, player.id).length > SECTION_CAP ? () => setShowPastComm((v) => !v) : undefined} expanded={showPastComm} />
          {(showPastComm ? pastOrgsForPlayer(orgs, player.id) : pastOrgsForPlayer(orgs, player.id).slice(0, SECTION_CAP)).map((o) => {
            const m = memberEntry(o, player.id);
            const period = membershipPeriod(m);
            return (
              <TouchableOpacity accessibilityRole="button" key={o.id} activeOpacity={0.85} onPress={() => onOpenOrg?.(o.id)}>
                <Card style={[st.sportRow, { opacity: 0.65 }]}>
                  <Text style={st.sportIcon}>🏛️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={textStyles.body}>{o.name}</Text>
                    <Text style={textStyles.muted}>
                      {[roleInOrg(o, player.id), o.type, o.city, period].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Text style={st.chevron}>›</Text>
                </Card>
              </TouchableOpacity>
            );
          })}
        </>
      )}

      {/* App/account preferences (reminders, timezone, sign out, support) now
          live on the dedicated Settings screen instead of trailing the profile. */}
      {onOpenSettings && (
        <Button label="⚙  Settings" variant="ghost" onPress={onOpenSettings} style={{ marginTop: theme.spacing(2) }} />
      )}
      {onSignOut && (
        <Button label="Sign out" variant="ghost" onPress={onSignOut} />
      )}
    </ScrollView>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <Card style={st.statCard}>
      <Text style={st.statValue}>{value}</Text>
      <Text style={textStyles.muted}>{label}</Text>
    </Card>
  );
}

/** One club the player has represented, tagging its sport(s), jersey & period. */
function TeamRow({ team }: { team: TeamAffiliation }) {
  const sub = [
    team.sports.map((s) => getSport(s).icon).join(' '),
    team.jersey != null ? `#${team.jersey}` : '',
    teamPeriod(team),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Card style={st.sportRow}>
      <Text style={st.sportIcon}>🛡️</Text>
      <View style={{ flex: 1 }}>
        <Text style={textStyles.body}>{team.name}</Text>
        {sub ? <Text style={textStyles.muted}>{sub}</Text> : null}
      </View>
    </Card>
  );
}

/** Age & guardian verification — upload a document for the support team to review. */
function VerificationCard({ player, owner }: { player: Player; owner: boolean }) {
  const [v, setV] = useState(player.verification);
  const [busy, setBusy] = useState(false);
  useEffect(() => setV(player.verification), [player.verification]);

  const upload = async () => {
    const doc = await pickDocument();
    if (!doc) return;
    setBusy(true);
    await submitVerificationDoc(player.id, doc.name);
    const at = Date.now();
    setV((prev) => ({
      status: 'pending', docName: doc.name, submittedAt: at,
      history: [...(prev?.history ?? []), { action: 'submitted', at, docName: doc.name }],
    }));
    // Confirmation + the follow-up action (esp. the guardian step for minors).
    void notify({
      title: '📄 Date-of-birth proof submitted',
      body: isMinor(player.dob)
        ? "Sent to our team to review. Next: add your parent/guardian's details and make sure their mobile & email are verified — both are needed before you can join teams or tournaments."
        : "Sent to our team to review. You'll be notified once your age is approved.",
      playerId: player.id,
    });
    setBusy(false);
  };

  const status = v?.status;
  const badge =
    status === 'approved' ? { label: '☑️ Verified', color: theme.colors.primary }
    : status === 'pending' ? { label: '⏳ Pending review', color: theme.colors.accent }
    : status === 'rejected' ? { label: '✗ Rejected', color: theme.colors.danger }
    : { label: 'Not submitted', color: theme.colors.textMuted };

  return (
    <Card style={{ gap: theme.spacing(2) }}>
      <View style={st.verifyHead}>
        <Text style={textStyles.h3}>🛡️ Age & guardian verification</Text>
        <Pill label={badge.label} color={theme.colors.surfaceAlt} textColor={badge.color} />
      </View>
      <Text style={textStyles.muted}>
        Verify the player&apos;s date of birth by uploading a proof ID (image or PDF) — e.g. a birth certificate, school ID or passport. For under-18 players this also confirms the parent/guardian. Our support team reviews and approves it.
      </Text>
      {owner && status !== 'approved' && (
        <Button
          label={busy ? 'Uploading…' : status === 'pending' || status === 'rejected' ? '📎 Re-submit proof (image / PDF)' : '📎 Upload proof of DOB (image / PDF)'}
          variant="ghost"
          onPress={upload}
        />
      )}
      {status === 'pending' && (
        <Text style={textStyles.muted}>Submitted — sent to our support team ({SUPPORT_EMAIL}) for review. You&apos;ll be notified once it&apos;s checked.</Text>
      )}
      {status === 'rejected' && v?.note ? <Text style={st.rejectNote}>Support note: {v.note}</Text> : null}
      {/* Immutable, append-only history (compliance trail). */}
      {v?.history && v.history.length > 0 ? (
        <View style={st.historyBox}>
          <Text style={st.historyTitle}>🧾 Verification history</Text>
          {v.history.map((e, i) => (
            <View key={i} style={st.historyRow}>
              <Text style={[st.historyDot, { color: e.action === 'approved' ? theme.colors.primary : e.action === 'rejected' ? theme.colors.danger : theme.colors.accent }]}>
                {e.action === 'approved' ? '☑️' : e.action === 'rejected' ? '✗' : '📄'}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={st.historyLine}>
                  {e.action === 'submitted' ? `Submitted${e.docName ? ` · ${e.docName}` : ''}` : e.action === 'approved' ? `Approved by ${e.byName ?? 'support'}` : `Rejected by ${e.byName ?? 'support'}`}
                </Text>
                {e.action === 'rejected' && e.note ? <Text style={st.historyNote}>{e.note}</Text> : null}
              </View>
              <Text style={st.historyAt}>{new Date(e.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const st = StyleSheet.create({
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing(6) },
  emptyBlock: { gap: theme.spacing(3), paddingVertical: theme.spacing(8) },
  headerRow: { flexDirection: 'row', gap: theme.spacing(3), alignItems: 'center' },
  verifiedTick: { fontSize: theme.font.body },
  verifyHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(2) },
  rejectNote: { color: theme.colors.danger, fontSize: theme.font.small },
  historyBox: { marginTop: theme.spacing(1), paddingTop: theme.spacing(2), borderTopWidth: 1, borderTopColor: theme.colors.border, gap: theme.spacing(1) },
  historyTitle: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  historyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing(2) },
  historyDot: { fontSize: 12, width: 18, textAlign: 'center' },
  historyLine: { color: theme.colors.text, fontSize: theme.font.small },
  historyNote: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  historyAt: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  avatar: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: 64, height: 64 },
  avatarText: { fontSize: theme.font.h2, fontWeight: '800' },
  camBadge: {
    position: 'absolute', right: -2, bottom: -2, width: 24, height: 24, borderRadius: 12,
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  camIcon: { fontSize: 12 },
  tagRow: { flexDirection: 'row', gap: theme.spacing(2), marginTop: theme.spacing(2), flexWrap: 'wrap' },
  remindersOff: { color: theme.colors.textMuted, fontSize: theme.font.small, fontStyle: 'italic' },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(3) },
  statCard: { width: '30%', alignItems: 'center', gap: theme.spacing(1), flexGrow: 1 },
  statValue: { color: theme.colors.primary, fontSize: theme.font.h1, fontWeight: '900' },
  section: { marginTop: theme.spacing(2) },
  sportRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  detailLine: { color: theme.colors.accent, fontSize: theme.font.tiny, fontWeight: '700', marginTop: 1 },
  summaryLine: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '600', marginTop: 2 },
  sportIcon: { fontSize: 26 },
  chevron: { color: theme.colors.textMuted, fontSize: theme.font.h2, fontWeight: '700' },
});
