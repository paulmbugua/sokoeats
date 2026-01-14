// apps/web/src/components/ProfileCard.web.tsx

import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FaStar, FaStarHalfAlt, FaRegStar, FaCertificate, FaCheck } from 'react-icons/fa';
import { useShopContext } from '@mytutorapp/shared/context';
import useProfileCard from '@mytutorapp/shared/hooks/useProfileCard';
import type { Profile } from '@mytutorapp/shared/types';
import fallbackImg from '../assets/fallback.png';

interface ProfileCardProps {
  profile: Profile;
}

const ProfileCard: React.FC<ProfileCardProps> = ({ profile }) => {
  const { backendUrl, token } = useShopContext();
  const { ratingData } = useProfileCard(profile, backendUrl, token);

  // Show badge if DB says certified or hook says VERIFIED
  const showCertBadge = profile.role === 'tutor' && profile.certified === true;

  // Status pill color
  const statusColor =
    profile.status === 'Online'
      ? 'bg-green-400'
      : profile.status === 'Busy'
        ? 'bg-yellow-500'
        : profile.status === 'New'
          ? 'bg-blue-500'
          : profile.status === 'Free'
            ? 'bg-purple-500'
            : 'bg-pink-300';

  // Resolve first image
  const firstImage =
    Array.isArray(profile.gallery) && profile.gallery.length ? profile.gallery[0] : null;
  const resolvedImage =
    typeof firstImage === 'string' && firstImage.startsWith('/')
      ? `${backendUrl}${firstImage}`
      : firstImage || fallbackImg;

  // Build star icons
  const rating = Math.round(ratingData.avgRating * 2) / 2;
  const stars = Array.from({ length: 5 }, (_, i) => {
    const idx = i + 1;
    if (rating >= idx) return <FaStar key={i} className="text-yellow-500" />;
    if (rating + 0.5 === idx) return <FaStarHalfAlt key={i} className="text-yellow-500" />;
    return <FaRegStar key={i} className="text-yellow-500" />;
  });

  return (
    <Link
      to={`/profile/${profile.id}`}
      className="block focus:outline-none"
    >
      <motion.div
        whileHover={{ scale: 1.05 }}
        transition={{ duration: 0.3 }}
        className="relative w-full h-40 sm:h-48 md:h-56 lg:h-64 bg-gray-100 rounded-lg overflow-hidden shadow-lg cursor-pointer"
      >
        {/* Background image */}
        <img
          src={resolvedImage}
          alt={profile.name || 'Unnamed'}
          className="w-full h-full object-cover"
        />

        {/* Certificate badge */}
        {showCertBadge && (
          <div className="absolute top-2 left-2 w-8 h-8 rounded-full flex items-center justify-center">
            <FaCertificate className="text-yellow-500 text-2xl" />
            <div className="absolute inset-0 flex items-center justify-center">
              <FaCheck className="text-white text-xs" />
            </div>
          </div>
        )}

        {/* Bottom overlay */}
        <div className="absolute bottom-0 left-0 w-full px-3 py-2 bg-gradient-to-t from-black/80 to-transparent text-white">
          {/* Name & status */}
          <div className="flex justify-between items-center">
            <h3 className="text-xs sm:text-sm md:text-base font-semibold truncate">
              {profile.name || 'Unnamed'}
            </h3>
            {profile.status && (
              <div className={`px-2 py-1 rounded-full ${statusColor}`}>
                <span className="text-[10px] sm:text-xs">{profile.status}</span>
              </div>
            )}
          </div>

          {/* Category */}
          {profile.role === 'tutor' && profile.category && (
            <div className="mt-1">
              <span className="text-[10px] sm:text-xs text-gray-200 truncate">
                {profile.category}
              </span>
            </div>
          )}

          {/* Stars + “review(s)” */}
          {profile.role === 'tutor' && (
            <div className="mt-1 flex items-center space-x-1 text-[8px] sm:text-[10px] md:text-xs">
              {stars}
              <span className="ml-1 whitespace-nowrap">
                ({ratingData.totalReviews} review
                {ratingData.totalReviews !== 1 ? 's' : ''})
              </span>
            </div>
          )}
        </div>
      </motion.div>
    </Link>
  );
};

export default ProfileCard;
