import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';
import OrgShareDialog from './OrgShareDialog.native';
import tw from '../../../tailwind';

type Props = {
  courseId?: string | null;
  courseTitle?: string | null;
  align?: 'left' | 'right';
};

export default function OrgShareBar({ courseId, courseTitle, align = 'right' }: Props) {
  const { isOwnerOrAdmin, activeOrgId, org } = useOrg();
  const [open, setOpen] = React.useState(false);

  const isInstructor =
    org?.my_role === 'instructor' ||
    org?.role === 'instructor' ||
    (Array.isArray(org?.roles) && org.roles.includes('instructor'));

  const canShare = (isOwnerOrAdmin || isInstructor) && !!activeOrgId;

  // If user cannot share, hide everything
  if (!canShare) return null;

  const disabled = !(courseId || (courseTitle && courseTitle.trim()));

  return (
    <View style={tw.style('w-full mt-3', align === 'right' ? 'items-end' : 'items-start')}>
      <TouchableOpacity
        disabled={disabled}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Share with learners"
        style={tw.style(
          'px-4 py-2 rounded-lg',
          disabled ? 'bg-indigo-400 opacity-60' : 'bg-indigo-600'
        )}
      >
        <Text style={tw`text-white font-semibold`}>Share with learners</Text>
      </TouchableOpacity>

      <OrgShareDialog
        open={open}
        onClose={() => setOpen(false)}
        courseId={courseId || null}
        courseTitle={courseTitle || null}
      />
    </View>
  );
}
