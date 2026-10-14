/**
 * Single owner of `document.title`. Features contribute a prefix (e.g. a CI status icon) and/or
 * a rewrite of GitLab's own title; this module composes them and re-applies when GitLab sets a
 * new title (in-page navigation). Two features each fighting over <title> with their own
 * observers would loop, hence one place.
 */

type Rewrite = (gitlabTitle: string) => string;

let prefix = '';
let rewrite: Rewrite | undefined;
/** The latest title GitLab itself set. */
let gitlabTitle: string | undefined;
/** What we last wrote, to tell our own mutations from GitLab's. */
let applied: string | undefined;
let observer: MutationObserver | undefined;

function apply(): void {
  gitlabTitle ??= document.title;
  if (!prefix && !rewrite) {
    // Nothing contributes any more: hand the title back to GitLab untouched.
    observer?.disconnect();
    observer = undefined;
    if (applied !== undefined && document.title === applied) document.title = gitlabTitle;
    applied = gitlabTitle = undefined;
    return;
  }
  if (!observer && document.head) {
    observer = new MutationObserver(() => {
      if (document.title === applied) return;
      gitlabTitle = document.title;
      apply();
    });
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
  }
  let base = gitlabTitle;
  try {
    if (rewrite) base = rewrite(gitlabTitle) || gitlabTitle;
  } catch {
    /* a broken rewrite must never blank the title */
  }
  applied = prefix + base;
  if (document.title !== applied) document.title = applied;
}

export const tabTitle = {
  setPrefix(p: string): void {
    prefix = p;
    apply();
  },
  setRewrite(fn: Rewrite | undefined): void {
    rewrite = fn;
    apply();
  },
  /** The current title without any prefix (e.g. for notification text). */
  text(): string {
    return applied !== undefined ? applied.slice(prefix.length) : document.title;
  },
};
