// apps/web/src/components/CourseHero.tsx
import React, { useMemo } from 'react';
import type { Course } from '@mytutorapp/shared/types';
import { pickImageForCourse } from '../utils/subjectImages';

type Props = {
  course: Course;
  backendUrl?: string;
  className?: string;
  alt?: string;
};

const CourseHero: React.FC<Props> = ({ course, backendUrl = '', className, alt }) => {
  const toAbs = (u?: string) => {
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    // if backendUrl is missing, return the relative path unmodified
    return backendUrl ? `${backendUrl.replace(/\/+$/, '')}${u}` : u;
  };

  const url = useMemo(() => {
    // 1) real cover/thumbnail from API
    const primary = toAbs((course as any).thumbnail_url || (course as any).cover_url);

    // 2) subject-based image (your existing helper)
    const subjectImg = toAbs(pickImageForCourse(course, backendUrl));

    // 3) seeded unique fallback so different courses don't share the same placeholder
    const seed = encodeURIComponent(
      String(course.id || (course as any).slug || course.title || 'course')
    );
    const fallback = `https://picsum.photos/seed/${seed}/800/450`;

    return primary || subjectImg || fallback;
  }, [course, backendUrl]);

  return (
    <div
      className={['aspect-video bg-center bg-cover', className].filter(Boolean).join(' ')}
      style={{ backgroundImage: `url("${url}")` }}
      role="img"
      aria-label={alt || course.title || 'Course image'}
    />
  );
};

export default CourseHero;
