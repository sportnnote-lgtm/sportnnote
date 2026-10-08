/** Data-driven player profile, shared by the Profile tab and PlayerProfile
 *  screen. Stays concise: header, follow, overall stats, and a tappable
 *  per-sport list. Deep per-sport stats/details live on SportProfileScreen. */
import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Card, Pill, Button, SelectChip, EmptyState, textStyles, plural } from './ui';
import { SectionHeader, SECTION_CAP } from './SectionHeader';
import { ContactCard } from './ContactCard';
import { inviteGuardianToLink } from '../data/messages';
import { isSupabaseConfigured } from '../core/supabase';
import { Linking } from 'react-native';
import { usePlayerProfile, useOrganizations } from '../data/hooks';
import { updatePlayer, uploadImage, verifyGuardianContact, submitVerificationDoc, reviewVerification, verificationDocUrl, getPendingVerifications, SUPPORT_EMAIL } from '../data/repos';
import { pickImage } from '../core/photo';
import { pickDocument } from '../core/document';
import { ageFromDob, ageOf, isMinor } from '../core/age';
import { notify } from '../core/notifications';
import { useAuth } from '../core/auth';
import { isSupport } from '../core/roles';
import { TextField } from './ui';
import { activeOrgsForPlayer, pastOrgsForPlayer, roleInOrg, memberEntry, membershipPeriod, isAcademicCommunity, currentStandard } from '../core/org';
import { teamsByRecency, teamPeriod, type TeamAffiliation } from '../core/teams';
import { getSport } from '../sports/registry';
import { sportSummary, hasPartialCoverage } from '../data/stats';
import type { Player, SportId } from '../core/types';
import { displayableImage } from '../core/imageUrl';
import { notice } from '../core/confirm';

export function ProfileView({
  playerId,
  follow,
  onShare,
  onMessage,
  onOpenSport,
  onEditProfile,
  onAdminEdit,
  onOpenOrg,
  onOpenSettings,
  onOpenVerificationReview,
  onCreateProfile,
  creating,
  onSignOut,
}: {
  playerId: string | null;
  follow?: { following: boolean; onToggle: () => void };
  /** Share this profile (record across sports + link). */
  onShare?: () => void;
  /** someone else's profile: open a conversation (routed to the guardian for under-18s) */
  onMessage?: () => void;
  /** open the dedicated per-sport profile page */
  onOpenSport?: (sport: SportId) => void;
  /** own profile: edit your own details */
  onEditProfile?: () => void;
  /** someone else's UNCLAIMED player I manage (parity #12): fix their details.
   *  Not onEditProfile — that one means "my own profile". */
  onAdminEdit?: () => void;
  /** open an organization the player belongs to */
  onOpenOrg?: (orgId: string) => void;
  /** own profile: open the Settings home (preferences, account, sign out) */
  onOpenSettings?: () => void;
  /** own profile + support role: open the verification review queue */
  onOpenVerificationReview?: () => void;
  /** own profile with no player yet: create it (first-time setup) */
  onCreateProfile?: () => void;
  /** true while the player profile is being created */
  creating?: boolean;
  /** own profile: sign out of the account */
  onSignOut?: () => void;
}) {
  const { player, stats: allStats, official, friendly } = usePlayerProfile(playerId);
  const orgs = useOrganizations();
  const { profile: viewer } = useAuth();
  const ownProfile = !!onEditProfile;
  const viewerIsSupport = isSupport(viewer?.role);
  // Support reviewers get a "pending approvals" entry on their own profile, so the
  // queue is reachable without hunting through notifications.
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  useEffect(() => {
    if (!(ownProfile && viewerIsSupport)) return;
    let on = true;
    getPendingVerifications().then((list) => on && setPendingCount(list.length));
    return () => { on = false; };
  }, [ownProfile, viewerIsSupport]);
  const [scope, setScope] = useState<'all' | 'official' | 'friendly'>('all');
  const [photo, setPhoto] = useState<string | undefined>(undefined);
  // Inline "See all" toggles — each record-list section shows 5, then expands.
  const [showSports, setShowSports] = useState(false);
  const [showTeams, setShowTeams] = useState(false);
  const [showComm, setShowComm] = useState(false);
  const [showPastComm, setShowPastComm] = useState(false);
  useEffect(() => setPhoto(player?.photoUrl), [player?.photoUrl]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const changePhoto = async () => {
    if (!player) return;
    const img = await pickImage({ aspect: [1, 1] });
    if (!img) return;
    const before = photo;
    setPhoto(img.uri); // preview while it uploads
    setPhotoBusy(true);
    try {
      const url = await uploadImage(img, 'player-photo');
      await updatePlayer(player.id, { photoUrl: url });
      setPhoto(url);
    } catch (e) {
      setPhoto(before);
      notice('Couldn’t save the photo', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setPhotoBusy(false);
    }
  };
  const shownPhoto = displayableImage(photo, !isSupabaseConfigured || photoBusy);

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
            {shownPhoto ? (
              <Image source={{ uri: shownPhoto }} style={[st.avatarImg, photoBusy && { opacity: 0.4 }]} />
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
            {ageOf(player) !== undefined ? ` · ${ageOf(player)} yrs` : ''}
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
      {!onEditProfile && onAdminEdit && (
        <Button label="✎ Edit player details" variant="ghost" onPress={onAdminEdit} />
      )}
      {onShare && <Button label={ownProfile ? '📤 Share my profile' : '📤 Share profile'} variant="ghost" onPress={onShare} />}
      {follow && (
        <Button
          label={follow.following ? '✓ Following' : '+ Follow player'}
          variant={follow.following ? 'ghost' : 'primary'}
          onPress={follow.onToggle}
        />
      )}
      {onMessage && !ownProfile && (
        <Button
          label={(ageOf(player) ?? 0) >= 18 ? '💬 Message' : '💬 Message their parent/guardian'}
          variant="ghost"
          onPress={onMessage}
        />
      )}

      {/* Support reviewer's own profile: a discoverable entry to the approvals
          queue (so notifications aren't the only way in). */}
      {ownProfile && viewerIsSupport && onOpenVerificationReview && (
        <TouchableOpacity accessibilityRole="button" activeOpacity={0.8} onPress={onOpenVerificationReview}>
          <Card style={st.reviewCard}>
            <View style={st.reviewCardRow}>
              <Text style={textStyles.h3}>🛡️ Verification review</Text>
              {pendingCount != null && pendingCount > 0 && (
                <Pill label={`${pendingCount} pending`} color={theme.colors.surfaceAlt} textColor={theme.colors.accent} />
              )}
            </View>
            <Text style={textStyles.muted}>
              {pendingCount == null ? 'Age & ID proofs awaiting review.'
                : pendingCount === 0 ? 'No submissions waiting — you’re all caught up.'
                : `${pendingCount} age/ID ${pendingCount === 1 ? 'proof is' : 'proofs are'} waiting for your review. Tap to open the queue.`}
            </Text>
          </Card>
        </TouchableOpacity>
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
          title={player.showPhone || player.showEmail
            ? `Contact · ${[player.showPhone && 'mobile', player.showEmail && 'email'].filter(Boolean).join(' & ')} shown on your profile`
            : 'Contact · only you can see this'}
          phone={player.phone}
          email={player.email}
          phoneVerified={player.phoneVerified}
          emailVerified={player.emailVerified}
          emailOtp
          phoneOtp
        />
      )}

      {/* Someone else's profile: contact details arrive only when they chose to
          show them (adults) or you run a team they were invited to (migration 0026). */}
      {!onEditProfile && (player.phone || player.email) && (
        <Card style={{ gap: theme.spacing(1) }}>
          <Text style={textStyles.h3}>📇 Contact</Text>
          {player.phone ? <Text style={textStyles.body}>📞 {player.phone}{player.phoneVerified ? '  ✓ verified' : ''}</Text> : null}
          {player.email ? <Text style={textStyles.body}>✉️ {player.email}{player.emailVerified ? '  ✓ verified' : ''}</Text> : null}
        </Card>
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
          // Live: the guardian's EMAIL is verified by them linking their own
          // account (code emailed to them); their PHONE by a WhatsApp code to
          // their number, checked server-side (guardian_phone channel).
          canVerify={isSupabaseConfigured ? { phone: true, email: false } : true}
          phoneOtpChannel="guardian_phone"
        />
      )}
      {onEditProfile && player.guardian && (ageOf(player) ?? 0) < 18 && (
        <GuardianLinkCard playerId={player.id} linked={!!player.guardianLinked} hasEmail={!!player.guardian.email} />
      )}

      {/* The verification workflow is the player's own business (and support's) —
          everyone else just sees the ☑️ tick next to the name once approved. */}
      {(onEditProfile || (player.verification && isSupport(viewer?.role))) && (
        <VerificationCard
          player={player}
          owner={!!onEditProfile}
          // A support reviewer viewing someone else's profile can act right here.
          reviewer={!onEditProfile && isSupport(viewer?.role) ? { id: viewer?.id, name: viewer?.fullName } : undefined}
        />
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

/** Age & guardian verification — the owner uploads a proof document; a support
 *  reviewer (viewing this profile) can open it and approve/reject right here. */
function VerificationCard({ player, owner, reviewer }: { player: Player; owner: boolean; reviewer?: { id?: string; name?: string } }) {
  const [v, setV] = useState(player.verification);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [opening, setOpening] = useState(false);
  useEffect(() => setV(player.verification), [player.verification]);

  // Reviewer: open the submitted document via a short-lived signed URL.
  const viewDoc = async () => {
    setOpening(true);
    try {
      const url = await verificationDocUrl(v?.docPath);
      if (url) await Linking.openURL(url);
    } finally {
      setOpening(false);
    }
  };

  // Reviewer: approve/reject, record the decision, and notify the submitter so
  // the update lands back on their profile (status + eligibility).
  const review = async (decision: 'approved' | 'rejected') => {
    setBusy(true);
    const reason = decision === 'rejected' ? note.trim() || undefined : undefined;
    await reviewVerification(player.id, decision, reason, reviewer);
    const at = Date.now();
    setV((prev) => ({
      ...(prev ?? {}),
      status: decision,
      note: reason,
      reviewedAt: at,
      reviewedById: reviewer?.id,
      reviewedByName: reviewer?.name,
      history: [...(prev?.history ?? []), { action: decision, at, byId: reviewer?.id, byName: reviewer?.name, note: reason }],
    }));
    const minor = (ageFromDob(player.dob) ?? 99) < 18;
    const guardianDone = !!(player.guardian?.phoneVerified && player.guardian?.emailVerified);
    void notify({
      title: decision === 'approved' ? '☑️ Verification approved' : '✗ Verification needs attention',
      body: decision === 'approved'
        ? (minor && !guardianDone
            ? "Your age & guardian are approved. Next: verify your guardian's mobile & email on your profile — then you can join teams, tournaments & matches."
            : 'Verified ✓ You can now be added to teams, tournaments and matches.')
        : `Rejected${reason ? `: ${reason}` : ''}. Please re-submit a clearer proof of date of birth on your profile.`,
      playerId: player.id,
    });
    setNote('');
    setBusy(false);
  };

  const upload = async () => {
    const doc = await pickDocument();
    if (!doc) return;
    setBusy(true);
    await submitVerificationDoc(player.id, doc);
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
      {status === 'pending' && !reviewer && (
        <Text style={textStyles.muted}>Submitted — sent to our support team ({SUPPORT_EMAIL}) for review. You&apos;ll be notified once it&apos;s checked.</Text>
      )}

      {/* Support reviewer, viewing this profile: open the doc + approve/reject. */}
      {reviewer && (
        <View style={{ gap: theme.spacing(2) }}>
          {v?.docPath ? (
            <Button label={opening ? 'Opening…' : '📄 View document'} variant="ghost" onPress={viewDoc} disabled={opening} />
          ) : (
            <Text style={textStyles.muted}>No document file on record (submitted before uploads were enabled, or in demo) — check the copy emailed to {SUPPORT_EMAIL}.</Text>
          )}
          {status === 'pending' && (
            <>
              <TextField label="Reason (if rejecting)" value={note} onChange={setNote} placeholder="e.g. Document unclear / DOB doesn’t match" />
              <View style={st.reviewRow}>
                <Button label="✗ Reject" variant="danger" style={st.reviewBtn} onPress={() => review('rejected')} disabled={busy} />
                <Button label={busy ? '…' : '☑️ Approve'} style={st.reviewBtn} onPress={() => review('approved')} disabled={busy} />
              </View>
            </>
          )}
          {status !== 'pending' && (
            <Text style={textStyles.muted}>{status === 'approved' ? '☑️ Approved' : '✗ Rejected'}{v?.reviewedByName ? ` by ${v.reviewedByName}` : ''}.</Text>
          )}
        </View>
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
  reviewRow: { flexDirection: 'row', gap: theme.spacing(3), marginTop: theme.spacing(1) },
  reviewBtn: { flex: 1 },
  reviewCard: { gap: theme.spacing(2), borderColor: theme.colors.accent },
  reviewCardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(2) },
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

/** Own profile of an under-18: get the parent/guardian onto SportnNote so messages
 *  about this player reach THEM (the player never receives messages directly). */
function GuardianLinkCard({ playerId, linked, hasEmail }: { playerId: string; linked: boolean; hasEmail: boolean }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const invite = async () => {
    setBusy(true);
    const r = await inviteGuardianToLink(playerId);
    setBusy(false);
    setNote(r.sent ? 'Sent! Ask your parent/guardian to check their email for the code.' : (r.reason ?? 'Could not send — try again later.'));
  };
  return (
    <Card style={{ gap: 8 }}>
      <Text style={textStyles.h3}>👪 Messages go to your parent/guardian</Text>
      {linked ? (
        <Text style={textStyles.muted}>Your parent/guardian has linked their account. Coaches and scouts who message about you reach them.</Text>
      ) : (
        <>
          <Text style={textStyles.muted}>
            Coaches and scouts can&apos;t message players under 18 directly. Invite your parent/guardian to link their own SportnNote account so they can read and reply.
          </Text>
          {hasEmail ? (
            <Button label={busy ? 'Sending…' : '📨 Email them a link code'} variant="ghost" onPress={invite} disabled={busy} />
          ) : (
            <Text style={textStyles.muted}>Add your parent/guardian&apos;s email in Edit profile first.</Text>
          )}
          {note ? <Text style={textStyles.body}>{note}</Text> : null}
        </>
      )}
    </Card>
  );
}
