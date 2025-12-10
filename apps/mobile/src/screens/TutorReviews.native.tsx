// apps/mobile/src/screens/TutorReviews.native.tsx
import React from 'react';
import { View, Text } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useShopContext } from '@mytutorapp/shared/context';
import { useTutorReviews } from '@mytutorapp/shared/hooks';
import tw from '../../tailwind';

type Props = {
  tutorId: string;
  showComments?: boolean;
};

const TutorReviews: React.FC<Props> = ({ tutorId, showComments = true }) => {
  // kept for parity; not directly used here but available if you resolve relative assets
  const { backendUrl } = useShopContext();
  const { reviews, avgRating, totalReviews } = useTutorReviews(tutorId);

  // round to nearest 0.5
  const rounded = Math.round((avgRating || 0) * 2) / 2;

  const StarRow = () => {
    const items = [];
    for (let i = 1; i <= 5; i++) {
      const full = rounded >= i;
      const half = !full && rounded + 0.5 === i;
      items.push(
        <FontAwesome
          key={i}
          name={full ? 'star' : half ? 'star-half-full' : 'star-o'}
          size={16}
          color={tw.color('yellow-500') || '#f59e0b'}
          style={tw`mr-1`}
        />,
      );
    }
    return <View style={tw`flex-row items-center`}>{items}</View>;
  };

  return (
    <View style={tw`w-full`}>
      {/* Header */}
      <Text
        style={tw`text-xl font-semibold text-pink-600 dark:text-pink-400 mb-3`}
      >
        Student Reviews
      </Text>

      {/* Summary: stars + count */}
      <View style={tw`flex-row items-center`}>
        <StarRow />
        <Text
          style={tw`ml-2 text-sm text-slate-600 dark:text-slate-300`}
        >
          ({totalReviews} {totalReviews === 1 ? 'review' : 'reviews'})
        </Text>
      </View>

      {/* Comments (optional) */}
      {showComments && reviews?.length > 0 && (
        <View style={tw`mt-4`}>
          {reviews.map((r) => (
            <View
              key={r.id}
              style={tw`p-4 rounded-xl bg-white dark:bg-[#0f1821] border border-gray-200 dark:border-white/10 mb-4`}
            >
              <Text
                style={tw`text-pink-600 dark:text-pink-400 font-semibold mb-1`}
              >
                {/* match web: show student name label */}
                {r.studentName ? `${r.studentName}:` : 'Student:'}
              </Text>
              <Text
                style={tw`text-[#0d141c] dark:text-gray-200`}
              >
                {r.comment || ''}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Optionally, you could show an empty-state message */}
      {showComments && (!reviews || reviews.length === 0) && (
        <View style={tw`mt-4`}>
          <Text style={tw`text-sm text-slate-600 dark:text-slate-400`}>
            No reviews yet. Be the first to review this tutor.
          </Text>
        </View>
      )}
    </View>
  );
};

export default TutorReviews;
