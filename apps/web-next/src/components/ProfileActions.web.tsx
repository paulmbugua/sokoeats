// apps/web/src/components/ProfileActions.web.tsx
import React from 'react';
import type { IconProp } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEnvelope, faHeart } from '@fortawesome/free-solid-svg-icons';
import { useProfileActions } from '@mytutorapp/shared/hooks';
import type { TutorProfile } from '@mytutorapp/shared/types';

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
    <div className="space-y-2">
      {showMessageButton && onSendMessage && (
        <button
          onClick={() => onSendMessage(recipientId)}
          className="inline-flex items-center justify-center w-full h-11 rounded-xl bg-primary text-white font-semibold shadow hover:shadow-md transition active:translate-y-[1px] focus:outline-none focus:ring-2 focus:ring-primary/60"
        >
          <FontAwesomeIcon icon={faEnvelope as IconProp} className="mr-2" />
          {messageLabel}
        </button>
      )}

      {/* Secondary action */}
      <button
        onClick={() => handleAddToFavorites(recipientId)}
        className="inline-flex items-center justify-center w-full h-11 rounded-xl bg-white text-darkText font-medium ring-1 ring-gray-200 shadow-sm hover:bg-softGray transition dark:bg-darkCard dark:text-darkTextPrimary dark:ring-darkCard"
      >
        <FontAwesomeIcon icon={faHeart as IconProp} className="mr-2 text-softPink" />
        Add to Favorites
      </button>
    </div>
  );
};

/* ---------- Header (name + status dot) ---------- */
ProfileActions.Header = ({ profile, statusColor }) => (
  <div className="flex items-center justify-between">
    <h2 className="text-xl sm:text-2xl font-bold tracking-tight">{profile.name}</h2>
    <span className={`inline-block w-3 h-3 rounded-full ${statusColor}`} aria-hidden="true" />
  </div>
);

/* ---------- Pricing list ---------- */
ProfileActions.Pricing = ({ pricing }) => (
  <div>
    <h3 className="text-base sm:text-lg font-semibold text-softPink mb-2">Session Pricing</h3>
    <ul className="space-y-1 text-sm">
      {Object.entries(pricing).map(([key, value]) => (
        <li
          key={key}
          className="flex items-center justify-between rounded-lg px-3 py-2 bg-white ring-1 ring-gray-200 shadow-sm dark:bg-darkCard dark:ring-darkCard"
        >
          <span className="text-darkTextSecondary capitalize">
            {key.replace(/([A-Z])/g, ' $1').trim()}
          </span>
          <span className="font-semibold text-primary">{value} Tokens</span>
        </li>
      ))}
    </ul>
  </div>
);

/* ---------- Status + last online ---------- */
ProfileActions.StatusButton = ({ status, statusColor, lastOnline }) => (
  <div className="flex items-center justify-between mt-2">
    <span className="text-sm text-darkTextSecondary">
      Status:{' '}
      <span
        className={`inline-flex items-center px-2 py-1 rounded-md text-white text-xs ${statusColor}`}
      >
        {status || 'Unknown'}
      </span>
    </span>
    <span className="text-xs text-mutedGray">Last Online: {lastOnline || 'N/A'}</span>
  </div>
);

/* ---------- Recommended tutors grid ---------- */
ProfileActions.Recommended = ({ recommended, statusColor }) => (
  <div className="mt-8 pb-10">
    <h3 className="text-lg sm:text-xl font-semibold text-primary mb-4">Recommended Tutors</h3>

    {recommended && recommended.length ? (
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {recommended.map((profile) => (
          <li
            key={profile.id}
            className="p-4 rounded-2xl bg-white ring-1 ring-gray-200 shadow-sm hover:shadow-md transition dark:bg-darkCard dark:ring-darkCard"
          >
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold truncate">{profile.name}</h4>
              <span
                className={`inline-block w-2.5 h-2.5 rounded-full ${statusColor}`}
                aria-hidden="true"
              />
            </div>
            <p className="text-sm text-darkTextSecondary">
              {typeof profile.description?.bio === 'string' && profile.description.bio.length
                ? profile.description.bio.slice(0, 120)
                : 'No bio provided.'}
            </p>
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-sm text-mutedGray">No recommended profiles available.</p>
    )}
  </div>
);

export default ProfileActions;
