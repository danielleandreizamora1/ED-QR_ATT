import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

export type UiIconName =
  | 'qr'
  | 'scan'
  | 'calendar'
  | 'clock'
  | 'pin'
  | 'user'
  | 'users'
  | 'search'
  | 'chevron-right'
  | 'chevron-left'
  | 'check'
  | 'x'
  | 'refresh'
  | 'camera'
  | 'wifi-off'
  | 'shield'
  | 'home'
  | 'history'
  | 'logout'
  | 'plus'
  | 'trash'
  | 'edit'
  | 'download'
  | 'alert'
  | 'school'
  | 'mail'
  | 'lock';

type Props = {
  name: UiIconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  testID?: string;
};

// Cross-platform stroke icons (works on iOS / Android / web).
// 24x24 viewBox, round caps — matches StatusIcon line language.
export function UiIcon({ name, size = 20, color = '#71717A', strokeWidth = 2, testID }: Props) {
  return (
    <View testID={testID} accessibilityRole="image" style={[styles.box, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Glyph name={name} color={color} stroke={strokeWidth} />
      </Svg>
    </View>
  );
}

function Glyph({ name, color, stroke }: { name: UiIconName; color: string; stroke: number }) {
  const s = {
    stroke: color,
    strokeWidth: stroke,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'qr':
      return (
        <>
          <Rect x="3.5" y="3.5" width="7" height="7" rx="1.5" {...s} />
          <Rect x="13.5" y="3.5" width="7" height="7" rx="1.5" {...s} />
          <Rect x="3.5" y="13.5" width="7" height="7" rx="1.5" {...s} />
          <Path d="M13.5 13.5h3v3h-3zM17.5 17.5h3v3h-3zM13.5 17.5v3" {...s} />
        </>
      );
    case 'scan':
      return (
        <>
          <Path d="M3.5 7.5v-3a1 1 0 0 1 1-1h3M17.5 3.5h3a1 1 0 0 1 1 1v3M20.5 16.5v3a1 1 0 0 1-1 1h-3M6.5 20.5h-3a1 1 0 0 1-1-1v-3" {...s} />
          <Line x1="4" y1="12" x2="20" y2="12" {...s} />
        </>
      );
    case 'calendar':
      return (
        <>
          <Rect x="3.5" y="5" width="17" height="15.5" rx="2.5" {...s} />
          <Line x1="3.5" y1="10" x2="20.5" y2="10" {...s} />
          <Line x1="8" y1="2.8" x2="8" y2="6.5" {...s} />
          <Line x1="16" y1="2.8" x2="16" y2="6.5" {...s} />
        </>
      );
    case 'clock':
      return (
        <>
          <Circle cx="12" cy="12" r="8.5" {...s} />
          <Path d="M12 7.5V12l3 2" {...s} />
        </>
      );
    case 'pin':
      return (
        <>
          <Path d="M12 21s6.5-5.6 6.5-10.5A6.5 6.5 0 0 0 5.5 10.5C5.5 15.4 12 21 12 21z" {...s} />
          <Circle cx="12" cy="10.5" r="2.2" {...s} />
        </>
      );
    case 'user':
      return (
        <>
          <Circle cx="12" cy="8" r="4" {...s} />
          <Path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" {...s} />
        </>
      );
    case 'users':
      return (
        <>
          <Circle cx="9" cy="8.5" r="3.5" {...s} />
          <Path d="M2.8 19.5a6.2 6.2 0 0 1 12.4 0" {...s} />
          <Path d="M16 5.5a3.5 3.5 0 0 1 0 6.8M17.5 13.7a6.2 6.2 0 0 1 3.7 5.8" {...s} />
        </>
      );
    case 'school':
      return (
        <>
          <Path d="M12 4L2.5 9 12 14l9.5-5L12 4z" {...s} />
          <Path d="M6.5 11.5V16c0 1.5 2.5 3 5.5 3s5.5-1.5 5.5-3v-4.5M21.5 9v5" {...s} />
        </>
      );
    case 'search':
      return (
        <>
          <Circle cx="11" cy="11" r="7" {...s} />
          <Line x1="16.5" y1="16.5" x2="20.5" y2="20.5" {...s} />
        </>
      );
    case 'chevron-right':
      return <Path d="M9.5 5.5L15.5 12l-6 6.5" {...s} />;
    case 'chevron-left':
      return <Path d="M14.5 5.5L8.5 12l6 6.5" {...s} />;
    case 'check':
      return <Path d="M4.5 12.5l5 5 10-11" {...s} />;
    case 'x':
      return (
        <>
          <Line x1="6" y1="6" x2="18" y2="18" {...s} />
          <Line x1="18" y1="6" x2="6" y2="18" {...s} />
        </>
      );
    case 'refresh':
      return (
        <>
          <Path d="M20 12a8 8 0 1 1-2.3-5.6" {...s} />
          <Path d="M20 3.5V8h-4.5" {...s} />
        </>
      );
    case 'camera':
      return (
        <>
          <Path d="M4 8h3l2-2.5h6L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" {...s} />
          <Circle cx="12" cy="14" r="3.5" {...s} />
        </>
      );
    case 'wifi-off':
      return (
        <>
          <Path d="M5 10a11 11 0 0 1 14 0M8.5 13.5a6.5 6.5 0 0 1 7 0" {...s} />
          <Circle cx="12" cy="18" r="1.2" fill={color} />
          <Line x1="4" y1="4" x2="20" y2="20" {...s} />
        </>
      );
    case 'shield':
      return (
        <>
          <Path d="M12 3l7.5 3v6c0 5-3.2 7.8-7.5 9-4.3-1.2-7.5-4-7.5-9V6L12 3z" {...s} />
          <Path d="M9 12l2.2 2.2L15.5 10" {...s} />
        </>
      );
    case 'home':
      return (
        <>
          <Path d="M4 11l8-7 8 7" {...s} />
          <Path d="M6 9.5V20h12V9.5" {...s} />
        </>
      );
    case 'history':
      return (
        <>
          <Path d="M4.5 12a7.5 7.5 0 1 1 2.2 5.3M4.5 12H2.8M4.5 12l-2-2.5" {...s} />
          <Path d="M12 8v4.5l3 1.8" {...s} />
        </>
      );
    case 'logout':
      return (
        <>
          <Path d="M14 4h-8a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h8" {...s} />
          <Path d="M10 12h11M17.5 8.5L21 12l-3.5 3.5" {...s} />
        </>
      );
    case 'plus':
      return (
        <>
          <Line x1="12" y1="5" x2="12" y2="19" {...s} />
          <Line x1="5" y1="12" x2="19" y2="12" {...s} />
        </>
      );
    case 'trash':
      return (
        <>
          <Path d="M4.5 6.5h15M9.5 6V4.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V6" {...s} />
          <Path d="M6.5 6.5l1 13a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1l1-13" {...s} />
        </>
      );
    case 'edit':
      return <Path d="M4 20l1-4.5L16.5 4a2.1 2.1 0 0 1 3 3L8 18.5 4 20z" {...s} />;
    case 'download':
      return (
        <>
          <Path d="M12 4v11M7.5 11.5L12 16l4.5-4.5" {...s} />
          <Path d="M4.5 20h15" {...s} />
        </>
      );
    case 'alert':
      return (
        <>
          <Path d="M12 4L2.8 20h18.4L12 4z" {...s} />
          <Line x1="12" y1="10" x2="12" y2="14" {...s} />
          <Circle cx="12" cy="17" r="0.8" fill={color} />
        </>
      );
    case 'mail':
      return (
        <>
          <Rect x="3" y="5.5" width="18" height="13" rx="2.5" {...s} />
          <Path d="M3.5 7l8.5 6 8.5-6" {...s} />
        </>
      );
    case 'lock':
      return (
        <>
          <Rect x="5" y="10.5" width="14" height="10" rx="2.5" {...s} />
          <Path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" {...s} />
        </>
      );
  }
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
});
