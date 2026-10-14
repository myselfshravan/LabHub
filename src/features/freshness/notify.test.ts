import { describe, expect, it } from 'vitest';
import type { Fingerprint } from './fingerprint';
import { notableChange } from './notify';

const mr = (over: Partial<Fingerprint['fields']> = {}, ciStatus: string | null = 'running') => ({
  fields: { state: 'opened', pipelineId: 1, approvals: '', ...over },
  ciStatus,
});

describe('notableChange', () => {
  it('reports a pipeline finishing', () => {
    expect(notableChange(mr(), mr({}, 'success'))).toBe('✅ Pipeline passed');
    expect(notableChange(mr({}, 'pending'), mr({}, 'failed'))).toBe('❌ Pipeline failed');
  });

  it('ignores a new pipeline and non-finishing transitions', () => {
    expect(notableChange(mr({}, 'success'), mr({ pipelineId: 2 }, 'running'))).toBeUndefined();
    expect(notableChange(mr({}, 'pending'), mr({}, 'running'))).toBeUndefined();
    expect(notableChange(mr({}, 'success'), mr({}, 'success'))).toBeUndefined();
    // A pipeline that started and finished between checks belongs to a different push.
    expect(notableChange(mr({}, 'running'), mr({ pipelineId: 2 }, 'success'))).toBeUndefined();
  });

  it('reports merge, close and new approvals', () => {
    expect(notableChange(mr(), mr({ state: 'merged' }))).toBe('🟣 Merged');
    expect(notableChange(mr(), mr({ state: 'closed' }))).toBe('🚫 Closed');
    expect(notableChange(mr({ approvals: '5' }), mr({ approvals: '5,9' }))).toBe('👍 New approval');
    expect(notableChange(mr({ approvals: '5,9' }), mr({ approvals: '5' }))).toBeUndefined();
    // Approvals endpoint unavailable on the first check: not news.
    expect(notableChange(mr({ approvals: null }), mr({ approvals: '5' }))).toBeUndefined();
  });

  it('works for pages without MR fields', () => {
    const job = (s: string): Fingerprint => ({ fields: { status: s }, ciStatus: s });
    expect(notableChange(job('running'), job('failed'), 'Job')).toBe('❌ Job failed');
  });
});
