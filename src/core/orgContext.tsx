/** The active "acting as" context (spec §17–18): a person is always one identity,
 *  but they act either as themselves (Personal) or on behalf of one organization
 *  they belong to. This holds just the chosen org id (null = Personal), persisted
 *  per device; consumers resolve the Organization and gate what they show/allow by
 *  the current context. Switching context never changes who you are — only the lens. */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useOrganizations } from '../data/hooks';
import { useAuth } from './auth';
import { activeOrgsForPlayer } from './org';
import { getMyPlayerId } from '../data/repos';
import type { Organization } from './types';

const KEY = 'sportnnote.activeOrgId';

interface OrgContextValue {
  /** the org being acted as, or null for Personal */
  activeOrgId: string | null;
  setActiveOrgId: (id: string | null) => void;
}

const Ctx = createContext<OrgContextValue | null>(null);

export function OrgContextProvider({ children }: { children: React.ReactNode }) {
  const [activeOrgId, setId] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    AsyncStorage.getItem(KEY).then((v) => { if (on && v) setId(v); }).catch(() => {});
    return () => { on = false; };
  }, []);

  const setActiveOrgId = useCallback((id: string | null) => {
    setId(id);
    if (id) AsyncStorage.setItem(KEY, id).catch(() => {});
    else AsyncStorage.removeItem(KEY).catch(() => {});
  }, []);

  return <Ctx.Provider value={{ activeOrgId, setActiveOrgId }}>{children}</Ctx.Provider>;
}

export function useOrgContext(): OrgContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useOrgContext must be used within OrgContextProvider');
  return ctx;
}

/** Resolve the active context: the current player id, the orgs they can act as, and
 *  the resolved active Organization (auto-cleared to Personal if the stored org is
 *  no longer one they belong to — e.g. after leaving it or switching accounts). */
export function useActiveOrg(): { myId: string | null; activeOrg: Organization | null; myOrgs: Organization[]; activeOrgId: string | null; setActiveOrgId: (id: string | null) => void } {
  const { profile } = useAuth();
  const { activeOrgId, setActiveOrgId } = useOrgContext();
  const orgs = useOrganizations();
  const [myId, setMyId] = useState<string | null>(null);
  useEffect(() => { let on = true; getMyPlayerId(profile?.id).then((id) => on && setMyId(id)); return () => { on = false; }; }, [profile?.id]);

  const myOrgs = activeOrgsForPlayer(orgs, myId);
  const activeOrg = activeOrgId ? myOrgs.find((o) => o.id === activeOrgId) ?? null : null;

  // Self-heal: a stored org the player no longer belongs to falls back to Personal.
  useEffect(() => {
    if (activeOrgId && myId && orgs.length && !myOrgs.some((o) => o.id === activeOrgId)) {
      setActiveOrgId(null);
    }
  }, [activeOrgId, myId, orgs.length, myOrgs, setActiveOrgId]);

  return { myId, activeOrg, myOrgs, activeOrgId, setActiveOrgId };
}
