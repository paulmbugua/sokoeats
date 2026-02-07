import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useThemePref } from '../theme/ThemeContext';

type SkeletonProps = {
  rows?: number;
  height?: number;
  radius?: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
};

const Skeleton: React.FC<SkeletonProps> = ({
  rows = 6,
  height = 16,
  radius = 10,
  gap = 10,
  style,
}) => {
  const { resolvedScheme } = useThemePref();
  const fill = resolvedScheme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

  return (
    <View style={style}>
      {Array.from({ length: rows }).map((_, idx) => (
        <View
          key={`skeleton-${idx}`}
          style={[
            styles.row,
            { height, borderRadius: radius, backgroundColor: fill, marginBottom: idx === rows - 1 ? 0 : gap },
          ]}
        />
      ))}
    </View>
  );
};

export default Skeleton;

const styles = StyleSheet.create({
  row: {
    width: '100%',
  },
});
