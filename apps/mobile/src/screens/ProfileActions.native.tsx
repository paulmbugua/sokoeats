// apps/mobile/src/screens/ProfileActions.native.tsx
/* eslint-disable react/prop-types, react/display-name */
/* eslint-disable prettier/prettier */
import React from 'react';
import { View, Text, TouchableOpacity, FlatList } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useProfileActions } from '@mytutorapp/shared/hooks';
import type { TutorProfile } from '@mytutorapp/shared/types';
import tw from '../../tailwind';

interface ProfileActionsProps {
  recipientId: string;
  onSendMessage?: (recipientId: string) => void;
  showMessageButton?: boolean;
  messageLabel?: string;
}

interface ProfileActionsStatic {
  Header: React.FC<{ profile: TutorProfile; statusColor: string }>;
  Pricing: React.FC<{ pricing: Record<string, number> }>;
  StatusButton: React.FC<{ status?: string; statusColor: string; lastOnline?: string }>;
  Recommended: React.FC<{ recommended?: TutorProfile[]; statusColor: string }>;
}

const ProfileActions: React.FC<ProfileActionsProps> & ProfileActionsStatic = ({
  recipientId,
  onSendMessage,
  showMessageButton = false,
  messageLabel = 'Send Message',
}) => {
  const { handleAddToFavorites } = useProfileActions();

  return (
    <View style={tw`w-full`}>
      {showMessageButton && onSendMessage && (
        <TouchableOpacity
          onPress={() => onSendMessage(recipientId)}
          accessibilityRole="button"
          accessibilityLabel={messageLabel}
          style={tw`w-full h-11 rounded-xl bg-primary items-center justify-center flex-row shadow
                   active:opacity-90 mb-2`}
        >
          <FontAwesome name="envelope" size={16} color="#fff" style={tw`mr-2`} />
          <Text style={tw`text-white font-semibold`}>{messageLabel}</Text>
        </TouchableOpacity>
      )}

      {/* Secondary action */}
      <TouchableOpacity
        onPress={() => handleAddToFavorites(recipientId)}
        accessibilityRole="button"
        accessibilityLabel="Add to Favorites"
        style={tw`w-full h-11 rounded-xl bg-white items-center justify-center flex-row
                   border border-gray-200/70 shadow-sm shadow-sm
                   dark:bg-[#0f1821] dark:border-darkCard`}
      >
        <FontAwesome
          name="heart"
          size={16}
          color={tw.color('softPink') || '#ec4899'}
          style={tw`mr-2`}
        />
        <Text style={tw`text-darkText font-medium dark:text-darkTextPrimary`}>
          Add to Favorites
        </Text>
      </TouchableOpacity>
    </View>
  );
};

/* ---------- Header (name + status dot) ---------- */
ProfileActions.Header = ({ profile, statusColor }) => (
  <View style={tw`flex-row items-center justify-between`}>
    <Text style={tw`text-xl font-bold text-darkText dark:text-darkTextPrimary`} numberOfLines={1}>
      {profile.name}
    </Text>
    <View accessibilityLabel="Status" style={tw.style('rounded-full w-3 h-3', statusColor)} />
  </View>
);

/* ---------- Pricing list (tiles with ring) ---------- */
ProfileActions.Pricing = ({ pricing }) => {
  const rows = Object.entries(pricing);
  return (
    <View>
      <Text style={tw`text-base font-semibold text-softPink mb-2`}>Session Pricing</Text>
      <View style={tw`gap-2`}>
        {rows.map(([key, value]) => (
          <View
            key={key}
            style={tw`flex-row items-center justify-between rounded-xl px-3 py-2
                      bg-white border border-gray-200/70 shadow-sm shadow-sm
                      dark:bg-[#0f1821] dark:border-darkCard`}
          >
            <Text style={tw`text-darkTextSecondary capitalize`}>
              {key.replace(/([A-Z])/g, ' $1').trim()}
            </Text>
            <Text style={tw`font-semibold text-primary`}>{value} Tokens</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

/* ---------- Status + last online ---------- */
ProfileActions.StatusButton = ({ status, statusColor, lastOnline }) => (
  <View style={tw`flex-row items-center justify-between mt-2`}>
    <Text style={tw`text-sm text-darkTextSecondary`}>
      Status:{' '}
      <Text style={tw.style('px-2 py-1 rounded-md text-white text-xs', statusColor)}>
        {status || 'Unknown'}
      </Text>
    </Text>
    <Text style={tw`text-xs text-mutedGray`}>Last Online: {lastOnline || 'N/A'}</Text>
  </View>
);

/* ---------- Recommended tutors grid ---------- */
ProfileActions.Recommended = ({ recommended, statusColor }) => {
  if (!recommended || recommended.length === 0) {
    return <Text style={tw`text-sm text-mutedGray mt-8`}>No recommended profiles available.</Text>;
  }

  // 2-column responsive-ish grid
  return (
    <View style={tw`mt-8 pb-6`}>
      <Text style={tw`text-lg font-semibold text-primary mb-4`}>Recommended Tutors</Text>

      <FlatList
        data={recommended}
        keyExtractor={(item) => String(item.id)}
        numColumns={2}
        columnWrapperStyle={tw`justify-between`}
        renderItem={({ item }) => (
          <View
            style={tw`w-[48%] p-4 rounded-2xl bg-white border border-gray-200/70 shadow-sm shadow-sm mb-3
                      dark:bg-[#0f1821] dark:border-darkCard`}
          >
            <View style={tw`flex-row items-center justify-between mb-2`}>
              <Text
                style={tw`font-semibold text-darkText dark:text-darkTextPrimary`}
                numberOfLines={1}
              >
                {item.name}
              </Text>
              <View style={tw.style('rounded-full w-2.5 h-2.5', statusColor)} />
            </View>
            <Text style={tw`text-sm text-darkTextSecondary`}>
              {typeof item.description?.bio === 'string' && item.description.bio.length
                ? item.description.bio.slice(0, 120)
                : 'No bio provided.'}
            </Text>
          </View>
        )}
      />
    </View>
  );
};

export default ProfileActions;
