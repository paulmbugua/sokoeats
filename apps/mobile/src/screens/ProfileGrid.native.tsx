// packages/mobile/src/screens/ProfileGrid.native.tsx

import React, { useState } from 'react';
import { View, Text, FlatList } from 'react-native';
import ProfileCardNative from './ProfileCard.native';
import type { Profile } from '@mytutorapp/shared/types';
import tw from '../../tailwind';

interface ProfileGridProps {
  profiles: Profile[];
}

const ProfileGridNative: React.FC<ProfileGridProps> = ({ profiles }) => {
  const [visibleCount, setVisibleCount] = useState(10);
  const loadMore = () => {
    if (visibleCount < profiles.length) {
      setVisibleCount((prev) => prev + 10);
    }
  };
  const dataToRender = profiles.slice(0, visibleCount);

  if (profiles.length === 0) {
    return (
      <View style={tw`p-4`}>
        <Text style={tw`text-center text-gray-500`}>No profiles available.</Text>
      </View>
    );
  }

  return (
    <View style={tw`p-4`}>
      <FlatList
        data={dataToRender}
        keyExtractor={(item) => item.id.toString()}
        numColumns={2}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        showsVerticalScrollIndicator={false}
        // Two-column layout with even spacing:
        columnWrapperStyle={tw`flex-row justify-between mb-4`}
        renderItem={({ item }) => (
          <View style={tw`w-[48%]`}>
            <ProfileCardNative profile={item} />
          </View>
        )}
      />
    </View>
  );
};

export default ProfileGridNative;
