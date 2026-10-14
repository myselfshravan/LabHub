/** GitHub-like visual theme. Pure CSS: injected/removed by the registry with the feature. */
import { defineFeature } from '@/core/feature';
import css from './theme.css?inline';

export default defineFeature({
  id: 'github-theme',
  title: 'GitHub look',
  description: 'GitHub (Primer) colors and system fonts, in light and dark mode.',
  defaultOn: true,
  css,
  init() {},
});
