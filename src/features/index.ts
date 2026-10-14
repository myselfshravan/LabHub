/** Every feature, in the order they start. Add new features here. */
import type { Feature } from '@/core/feature';
import commandPalette from './command-palette';
import freshness from './freshness';
import githubTheme from './github-theme';

export const FEATURES: Feature[] = [freshness, githubTheme, commandPalette];
