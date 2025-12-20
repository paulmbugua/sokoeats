// apps/mobile/src/screens/org/OrgHomeRouter.native.tsx
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import tw from '../../../tailwind';
import { useShopContext } from '@mytutorapp/shared/context';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';

type PendingDeepLink =
  | {
      type: 'robot';
      assignmentId?: string;
      courseId?: string;
      qt?: string;
      qs?: string;
    }
  | { type: 'invite' }
  | null;

const MUST_CHANGE_KEY = 'org:mustChangePassword';

/** Try to read 'auth:returnTo' from AsyncStorage if present (best-effort/no hard dep) */
async function getRawReturnTo(): Promise<string> {
  try {
    const mod = await import('@react-native-async-storage/async-storage');
    const v = await mod.default.getItem('auth:returnTo');
    return v || '';
  } catch {
    return '';
  }
}

/** Try to read must-change-password flag (same key as web: org:mustChangePassword) */
async function readMustChangePasswordNative(): Promise<boolean> {
  try {
    const mod = await import('@react-native-async-storage/async-storage');
    const v = await mod.default.getItem(MUST_CHANGE_KEY);
    return v === '1' || v === 'true';
  } catch {
    return false;
  }
}

/** Parse a web-style returnTo path into mobile navigation intent */
function parseReturnTo(saved: string | null | undefined): PendingDeepLink {
  if (!saved) return null;
  if (/\/org\/join\//.test(saved)) return { type: 'invite' };

  // very light query parse for assignment hints
  const qs = saved.split('?')[1] || '';
  let parts: URLSearchParams;
  try {
    parts = new URLSearchParams(qs);
  } catch {
    return null;
  }

  const assignmentId = parts.get('assignmentId') || undefined;
  const courseId = parts.get('courseId') || undefined;
  const qt = parts.get('qt') || undefined;
  const qsSize = parts.get('qs') || undefined;

  if (assignmentId) return { type: 'robot', assignmentId, courseId, qt, qs: qsSize };
  return null;
}

export default function OrgHomeRouterNative() {
  const navigation = useNavigation<any>();
  const { orgToken } = useShopContext() as any;

  // useOrg shape can vary a bit, so cast loosely (like web version)
  const orgState = (useOrg?.() ?? {}) as any;
  const { org, role: rawRole, loading, isLoading } = orgState;

  const busy = typeof loading === 'boolean' ? loading : isLoading;

  const normalizedRole = (rawRole || '').toString().toLowerCase();
  const isLearner = normalizedRole === 'learner' || normalizedRole === 'student';
  const isInstructor = normalizedRole === 'instructor' || normalizedRole === 'teacher';
  const isOrgAdmin = normalizedRole === 'owner' || normalizedRole === 'admin';

  const [checking, setChecking] = useState(true);
  const orgMissingSince = useRef<number | null>(null);

  /**
   * ✅ Prevent infinite loops:
   * - Only allow ONE routing decision per mount.
   * - Don’t reset if we are already on the target route.
   */
  const didRoute = useRef(false);

  const safeReset = (name: string, params?: any) => {
    const state = navigation.getState?.();
    const current = state?.routes?.[state.index ?? 0]?.name;

    if (current === name) return; // already on target
    if (didRoute.current) return; // already routed once

    didRoute.current = true;
    navigation.reset({
      index: 0,
      routes: [{ name, params }],
    });
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (cancelled) return;

      // Not authenticated for org → go to institution login
      if (!orgToken) {
        if (!cancelled) {
          safeReset('InstitutionLogin', { next: '/org' });
          setChecking(false);
        }
        return;
      }

      // Still resolving org + role → keep spinner
      if (busy) return;

      // Give useOrg a grace window to resolve org before "recovering" to login.
      if (!org) {
        if (orgMissingSince.current == null) {
          orgMissingSince.current = Date.now();
          return; // keep spinner
        }

        const waitedMs = Date.now() - orgMissingSince.current;
        if (waitedMs < 1500) {
          return; // still give it time
        }

        if (!cancelled) {
          safeReset('InstitutionLogin', { next: '/org', logoutOrg: true });
          setChecking(false);
        }
        return;
      }

      // ✅ org is present again, clear grace timer
      orgMissingSince.current = null;

      // Read must-change flag + saved deep-link once
      const [mustChangePassword, saved] = await Promise.all([
        readMustChangePasswordNative(),
        getRawReturnTo(),
      ]);

      // 🔐 Force password change for learners & instructors on first login
      if (mustChangePassword && (isLearner || isInstructor)) {
        if (!cancelled) {
          safeReset('OrgChangePassword', { returnTo: saved || '/org' });
          setChecking(false);
        }
        return;
      }

      // 🎓 Learners: respect saved deep-link (assignments / invites), else learner home
      if (isLearner) {
        const parsed = parseReturnTo(saved);

        if (!cancelled) {
          if (parsed?.type === 'robot') {
            safeReset('RobotTutor', {
              flow: 'org',
              lock: '1',
              ...(parsed.assignmentId ? { assignmentId: parsed.assignmentId } : {}),
              ...(parsed.courseId ? { courseId: parsed.courseId } : {}),
              ...(parsed.qt ? { qt: parsed.qt } : {}),
              ...(parsed.qs ? { qs: parsed.qs } : {}),
            });
          } else {
            // invite or none -> learner home
            safeReset('OrgLearnerHome');
          }
          setChecking(false);
        }
        return;
      }

      // 👩‍🏫 Instructors → instructor home
      if (isInstructor) {
        if (!cancelled) {
          safeReset('OrgInstructorHome');
          setChecking(false);
        }
        return;
      }

      // 👑 Owners / admins only → org profile
      if (isOrgAdmin) {
        if (!cancelled) {
          safeReset('OrgProfile');
          setChecking(false);
        }
        return;
      }

      // ❓ Unknown role → back to login
      if (!cancelled) {
        safeReset('InstitutionLogin', { next: 'OrgHome' });
        setChecking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orgToken, busy, org, isLearner, isInstructor, isOrgAdmin, navigation]);

  if (checking) {
    return (
      <View style={tw`flex-1 bg-[#0b1220] items-center justify-center`}>
        <ActivityIndicator />
        <Text style={tw`mt-2 text-white/70`}>Loading your institution portal…</Text>
      </View>
    );
  }

  // Should never render anything once routing is done
  return null;
}
