import { useCallback, useEffect, useRef, useState } from 'react';
import type { Certificate } from '@mytutorapp/shared/types';
import { getEligibility, generateCertificate, getMyCertificates } from '@mytutorapp/shared/api';

type UseCertificateOpts = {
  backendUrl: string;
  token: string;
  courseId: string;
  /** Optional: set true right after grading pass to show the button instantly */
  justPassed?: boolean;
};

export function useCertificate(opts: UseCertificateOpts) {
  const { backendUrl, token, courseId, justPassed } = opts;

  const [eligible, setEligible] = useState<boolean>(false);
  const [eligibilityReason, setEligibilityReason] = useState<string | null>(null);
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const mounted = useRef(true);

  // Per-course local mirror so the CTA survives reloads while logged-in
  const lsKey = `cert:elig:${courseId}`;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Hydrate from localStorage (only when logged in)
  useEffect(() => {
    if (!token || !courseId) return;
    try {
      const v = localStorage.getItem(lsKey);
      if (v === '1') setEligible(true);
    } catch {}
  }, [token, courseId, lsKey]);

  // If caller flags "just passed", show CTA immediately (optimistic)
  useEffect(() => {
    if (!token) return;
    if (justPassed) setEligible(true);
  }, [justPassed, token]);

  // Keep localStorage in sync with current eligibility while logged in
  useEffect(() => {
    if (!token) return;
    try {
      if (eligible) localStorage.setItem(lsKey, '1');
      else localStorage.removeItem(lsKey);
    } catch {}
  }, [eligible, token, lsKey]);

  // If the user logs out, reset everything (and remove local mirror)
  useEffect(() => {
    if (token) return;
    try {
      localStorage.removeItem(lsKey);
    } catch {}
    setEligible(false);
    setCertificate(null);
    setEligibilityReason(null);
    setErr(null);
  }, [token, lsKey]);

  const check = useCallback(async () => {
    if (!token || !courseId) return;
    setLoading(true);
    setErr(null);

    try {
      // Server-validated eligibility
      const e = await getEligibility(backendUrl, token, courseId);
      if (!mounted.current) return;

      // Prefer server truth, but keep optimistic true if we already showed it
      setEligible((prev) => Boolean(e?.eligible) || prev);
      setEligibilityReason(e?.reason || null);

      // Also see if a cert already exists for this course
      const mine = await getMyCertificates(backendUrl, token);
      if (!mounted.current) return;

      const found =
        (mine || []).find((c: any) => String(c.course_id) === String(courseId)) || null;

      setCertificate(found);

      // Persist mirror after server check
      try {
        if (e?.eligible || found) localStorage.setItem(lsKey, '1');
        else localStorage.removeItem(lsKey);
      } catch {}
    } catch (e: any) {
      if (!mounted.current) return;
      setErr(e?.response?.data?.error || e?.message || 'Failed to check certificate status');
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [backendUrl, token, courseId, lsKey]);

  const generate = useCallback(async () => {
    setLoading(true);
    setErr(null);

    try {
      const c = await generateCertificate(backendUrl, token, courseId);
      if (!mounted.current) return null;

      setCertificate(c);
      setEligible(true);

      try {
        localStorage.setItem(lsKey, '1');
      } catch {}

      return c;
    } catch (e: any) {
      if (mounted.current) {
        setErr(e?.response?.data?.error || e?.message || 'Failed to generate certificate');
      }
      throw e;
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [backendUrl, token, courseId, lsKey]);

  // Initial + whenever deps change
  useEffect(() => {
    check();
  }, [check]);

  return {
    eligible,
    eligibilityReason,
    certificate,
    loading,
    error: err,
    refetch: check,
    generate,
  };
}
