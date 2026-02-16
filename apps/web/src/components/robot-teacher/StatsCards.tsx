import React from 'react';

type StatsCardsProps = { courseCount?: number };

const StatsCards: React.FC<StatsCardsProps> = ({ courseCount }) => {
  const safeCount = Math.max(12, courseCount || 0);
  const cards = [
    { label: `${safeCount}+ courses available`, sub: 'Growing catalog' },
    { label: 'Always-on AI guidance', sub: '24/7 support flow' },
    { label: 'Quiz + certificate track', sub: 'Learn and verify skills' },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-3">
      {cards.map((card) => (
        <article key={card.label} className="panel rounded-2xl p-4">
          <div className="text-base font-bold text-gray-900 dark:text-white">{card.label}</div>
          <div className="mt-1 text-xs text-gray-600 dark:text-white/70">{card.sub}</div>
        </article>
      ))}
    </section>
  );
};

export default StatsCards;
