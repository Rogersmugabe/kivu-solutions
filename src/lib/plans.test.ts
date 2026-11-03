import { describe, expect, it } from 'vitest';
import sql from '../../supabase/migrations/003_momo_subscription_payments.sql?raw';
import { PLANS } from './access';

describe('plan prices', () => {
  it('charges in the database what the Plans page shows', () => {
    const charged = Object.fromEntries([...sql.matchAll(/when '(\w+)'\s+then (\d+)/g)].map(m => [m[1], Number(m[2])]));
    expect(charged).toEqual(Object.fromEntries(PLANS.map(p => [p.key, p.price])));
  });
});
