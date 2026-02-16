import React from 'react';

type Item = { id: string; title: string; blurb?: string; rating?: number; reviews?: number; tag?: string };

type CourseCardGridProps = {
  title: string;
  items: Item[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onStartSelected?: (id: string) => void;
};

const CourseCardGrid: React.FC<CourseCardGridProps> = ({ title, items, activeId, onSelect, onStartSelected }) => {
  return (
    <section className="space-y-3">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
      <div className="flex gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-2 lg:grid-cols-3 md:overflow-visible">
        {items.map((item) => {
          const active = activeId === item.id;
          return (
            <article
              key={item.id}
              className={`panel min-w-[240px] p-4 transition hover:-translate-y-0.5 ${active ? 'ring-2 ring-indigo-500 dark:ring-indigo-400' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className="line-clamp-2 text-sm font-semibold text-gray-900 dark:text-white">{item.title}</h4>
                <span className="chip text-[10px]">{item.tag || 'Popular'}</span>
              </div>
              {item.blurb ? <p className="mt-2 line-clamp-2 text-xs text-gray-600 dark:text-white/70">{item.blurb}</p> : null}
              <div className="mt-3 flex items-center justify-between">
                <button onClick={() => onSelect(item.id)} className={`chip ${active ? 'chip-active' : ''}`}>
                  {active ? 'Selected' : 'Select'}
                </button>
                {onStartSelected ? (
                  <button onClick={() => onStartSelected(item.id)} className="text-xs font-semibold text-indigo-600 dark:text-indigo-300">
                    Start →
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};

export default CourseCardGrid;
