import React from 'react';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';
import OrgShareDialog from './OrgShareDialog';

type Props = {
  courseId?: string | null;
  courseTitle?: string | null;
  align?: 'left' | 'right';
};

export default function OrgShareBar({ courseId, courseTitle, align = 'right' }: Props) {
  const { isOwnerOrAdmin, activeOrgId, org } = useOrg();
  const isInstructor =
    org?.my_role === 'instructor' ||
    org?.role === 'instructor' ||
    (Array.isArray(org?.roles) && org.roles.includes('instructor'));
  const canShare = (isOwnerOrAdmin || isInstructor) && !!activeOrgId;

  if (!canShare) return null;
  const [open, setOpen] = React.useState(false); // remove the second gate

  const disabled = !(courseId || (courseTitle && courseTitle.trim()));

  return (
    <>
      <div className={`w-full mt-3 ${align === 'right' ? 'text-right' : ''}`}>
        <button
          className="btn bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60"
          disabled={disabled}
          onClick={() => setOpen(true)}
          title={
            disabled ? 'Select a course first' : `Share in ${org?.name ?? 'your organization'}`
          }
        >
          Share with learners
        </button>
      </div>
      <OrgShareDialog
        open={open}
        onClose={() => setOpen(false)}
        courseId={courseId || null}
        courseTitle={courseTitle || null}
      />
    </>
  );
}
