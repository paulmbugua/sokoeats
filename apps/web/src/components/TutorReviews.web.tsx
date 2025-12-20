import React from 'react';
import {
  FaStar as RawFaStar,
  FaStarHalfAlt as RawFaStarHalfAlt,
  FaRegStar as RawFaRegStar,
} from 'react-icons/fa';
import type { IconType } from 'react-icons';
import { useShopContext } from '@mytutorapp/shared/context';
import { useTutorReviews } from '@mytutorapp/shared/hooks';

interface TutorReviewsProps {
  tutorId: string;
  showComments?: boolean;
}

const TutorReviews: React.FC<TutorReviewsProps> = ({ tutorId, showComments = true }) => {
  const { backendUrl } = useShopContext();
  const { reviews, avgRating, totalReviews } = useTutorReviews(tutorId);

  // Use react-icons' IconType instead of manual SVG prop casting
  const StarIcon: IconType = RawFaStar;
  const StarHalfIcon: IconType = RawFaStarHalfAlt;
  const StarEmptyIcon: IconType = RawFaRegStar;

  // Avoid JSX.Element – use React.ReactElement or React.ReactNode
  const renderStars = (): React.ReactElement[] => {
    const stars: React.ReactElement[] = [];
    const rating = Math.round(avgRating * 2) / 2;
    for (let i = 1; i <= 5; i++) {
      if (rating >= i) {
        stars.push(<StarIcon key={i} className="text-yellow-500" />);
      } else if (rating + 0.5 === i) {
        stars.push(<StarHalfIcon key={i} className="text-yellow-500" />);
      } else {
        stars.push(<StarEmptyIcon key={i} className="text-yellow-500" />);
      }
    }
    return stars;
  };

  return (
    <div className="tutor-reviews">
      {/* Header */}
      <h3 className="text-xl font-semibold text-primary mb-3">Student Reviews</h3>

      {/* Rating summary */}
      <div className="flex items-center">
        {renderStars()}
        <span className="ml-2 text-sm text-darkTextSecondary dark:text-darkTextPrimary">
          ({totalReviews} {totalReviews === 1 ? 'review' : 'reviews'})
        </span>
      </div>

      {/* Only render comments if showComments is true */}
      {showComments && (
        <div className="mt-4 space-y-4">
          {reviews.map((review) => (
            <div
              key={review.id}
              className="p-4 rounded-lg bg-white dark:bg-darkCard shadow-sm ring-1 ring-gray-200 dark:ring-darkCard"
            >
              <p className="text-primary font-bold mb-1">{review.studentName}:</p>
              <p className="text-darkText dark:text-darkTextPrimary">{review.comment}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TutorReviews;
