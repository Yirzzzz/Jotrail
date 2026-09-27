/**
 * Renders a journey's optional icon.
 *
 * Icons are stored as names, so the set can grow without a migration. An
 * unknown or absent name falls back to a neutral glyph — an icon is never
 * required (ACCEPTANCE.md §B).
 */

import {
  Bot,
  Briefcase,
  Compass,
  Dumbbell,
  FlaskConical,
  GraduationCap,
  Heart,
  Landmark,
  Leaf,
  Lightbulb,
  Map,
  Notebook,
  PiggyBank,
  Plane,
  Sprout,
  Target,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  briefcase: Briefcase,
  bot: Bot,
  dumbbell: Dumbbell,
  'piggy-bank': PiggyBank,
  plane: Plane,
  notebook: Notebook,
  'graduation-cap': GraduationCap,
  target: Target,
  heart: Heart,
  leaf: Leaf,
  sprout: Sprout,
  compass: Compass,
  map: Map,
  lightbulb: Lightbulb,
  'flask-conical': FlaskConical,
  landmark: Landmark,
};

/** Names offered when creating a journey. */
export const JOURNEY_ICON_NAMES = Object.keys(ICONS);

export function JourneyIcon({
  name,
  size = 16,
  strokeWidth = 1.75,
}: {
  name: string | null;
  size?: number;
  strokeWidth?: number;
}) {
  const Icon = (name && ICONS[name]) || Compass;
  return <Icon size={size} strokeWidth={strokeWidth} aria-hidden />;
}
