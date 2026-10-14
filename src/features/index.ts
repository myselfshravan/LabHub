/** Every feature, in the order they start. Add new features here. */
import type { Feature } from '@/core/feature';
import commandPalette from './command-palette';
import freshness from './freshness';
import githubLayout from './github-layout';
import githubTheme from './github-theme';
import tabTitles from './tab-titles';

export const FEATURES: Feature[] = [
  freshness,
  githubTheme,
  githubLayout,
  commandPalette,
  tabTitles,
];
