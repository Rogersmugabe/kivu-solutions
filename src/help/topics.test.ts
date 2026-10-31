import { describe, expect, it } from 'vitest';
import { HELP_TOPICS, searchTopics, topicsFor } from './topics';
import { INVITABLE_ROLES } from '@/lib/access';

describe('help topics', () => {
  it('bundles every guide with content', () => {
    for (const t of HELP_TOPICS) expect(t.body.trim().startsWith('# ')).toBe(true);
  });
  it('gives every role its own guides', () => {
    for (const role of ['owner', ...INVITABLE_ROLES] as const) expect(topicsFor(role, true).length).toBeGreaterThan(1);
    expect(topicsFor('stock_clerk', false).map(t => t.id)).toEqual(['staff', 'stock', 'faq']);
    expect(topicsFor('cashier', false).map(t => t.id)).not.toContain('billing');
  });
  it('shows the tables guide only to bars and restaurants', () => {
    expect(topicsFor('owner', false).map(t => t.id)).not.toContain('tables');
    expect(topicsFor('waiter', true).map(t => t.id)).toContain('tables');
  });
  it('searches the guide text', () => {
    const hits = searchTopics(HELP_TOPICS, 'blind count');
    expect(hits.map(h => h.topic.id)).toContain('money');
    expect(searchTopics(HELP_TOPICS, '   ')).toEqual([]);
  });
});
