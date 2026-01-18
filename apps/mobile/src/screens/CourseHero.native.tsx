
import React from 'react';
import { ImageBackground, View } from 'react-native';
import tw from '../../tailwind';
import type { Course } from '@mytutorapp/shared/types';
import { pickImageUriForCourse } from '../../utils/subjectImages';

type Props = {
  course: Course;
  backendUrl?: string;
  /** tailwind classes (twrnc) */
  className?: string;
  alt?: string;
};

const CourseHero: React.FC<Props> = ({ course, backendUrl, className, alt }) => {
  const url = pickImageUriForCourse(course, backendUrl);

  const base = tw`w-full`;
  const ratio = { aspectRatio: 16 / 9 };
  const extra = className ? tw`${className}` : undefined;

  if (!url) {
    return (
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={alt || course.title || 'Course image'}
        style={[base, ratio, extra, tw`bg-black/20`]}
      />
    );
  }

  return (
    <ImageBackground
      source={{ uri: url }}
      resizeMode="cover"
      accessible
      accessibilityRole="image"
      accessibilityLabel={alt || course.title || 'Course image'}
      style={[base, ratio, extra]}
    />
  );
};

export default CourseHero;
