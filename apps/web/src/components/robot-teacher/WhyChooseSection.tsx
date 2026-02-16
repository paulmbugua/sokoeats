import React from 'react';

const FEATURES = [
  { t: 'Adaptive explanations', d: 'Adjusts depth, pace, and examples to your level.' },
  { t: 'Audio + captions', d: 'Listen, read, and replay with clear pacing.' },
  { t: 'Instant quizzes', d: 'Check understanding immediately after lessons.' },
  { t: 'Certificate path', d: 'Progress toward verified completion milestones.' },
];

const WhyChooseSection: React.FC = () => (
  <section className="space-y-3">
    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Why choose AI Tutor Studio</h3>
    <div className="grid gap-3 sm:grid-cols-2">
      {FEATURES.map((feature) => (
        <article key={feature.t} className="panel p-4">
          <div className="text-sm font-semibold text-gray-900 dark:text-white">{feature.t}</div>
          <p className="mt-1 text-xs text-gray-600 dark:text-white/70">{feature.d}</p>
        </article>
      ))}
    </div>
  </section>
);

export default WhyChooseSection;
