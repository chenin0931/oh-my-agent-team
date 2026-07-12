import Svg, { Circle, Ellipse, Polygon, Rect } from "react-native-svg";
import { THEME } from "@/lib/theme";
import { useColorScheme } from "@/lib/use-color-scheme";

interface OhMyAgentTeamLogoProps {
  size?: number;
  color?: string;
  monochrome?: boolean;
}

export function OhMyAgentTeamLogo({
  size = 48,
  color,
  monochrome = false,
}: OhMyAgentTeamLogoProps) {
  const { isDarkColorScheme } = useColorScheme();
  const foreground =
    color ?? (isDarkColorScheme ? THEME.dark.foreground : THEME.light.foreground);
  const node = (value: string) => (monochrome ? foreground : value);

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Ellipse cx={50} cy={50} rx={35} ry={41} fill="none" stroke={foreground} strokeWidth={10} />
      <Circle cx={20} cy={28} r={9} fill={node("#ef6a5b")} />
      <Rect x={71} y={19} width={18} height={18} rx={4} fill={node("#35a66f")} />
      <Polygon points="23,64 34,75 23,86 12,75" fill={node("#33a7c8")} />
      <Circle cx={78} cy={76} r={8} fill={node("#e1b640")} />
    </Svg>
  );
}
