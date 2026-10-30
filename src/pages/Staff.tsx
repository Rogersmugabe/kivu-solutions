import { useState, type FormEvent } from 'react';
import { UserPlus, Users, Copy, MessageCircle, Check } from 'lucide-react';
import { useShop } from '@/auth/AuthProvider';
import { useAction, useEmployees, useStaffInvites } from '@/data/hooks';
import { useFeedback } from '@/components/feedback';
import { Badge, Button, Card, Dialog, EmptyState, Field, Input, Notice, PageHeader, Select, Spinner } from '@/components/ui';
import { formatDate, isValidRwPhone, normalizeRwPhone } from '@/lib/format';
import { INVITABLE_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/access';
import { rpc } from '@/lib/supabase';
import type { Employee, Role } from '@/lib/types';

export default function Staff() {
  const { session, can } = useShop();
  const { confirm, toast } = useFeedback();
  const employees = useEmployees();
  const invites = useStaffInvites(can('invite_staff'));
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', role: 'cashier' as Role });
  const [created, setCreated] = useState<{ code: string; name: string; phone: string; role: Role } | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const pending = (invites.data ?? []).filter(i => !i.used_at && new Date(i.expires_at) > new Date());

  const invite = useAction(async () => {
    setInviteError(null);
    const phone = normalizeRwPhone(form.phone);
    if (!form.name.trim()) throw new Error('Enter the employee name.');
    if (!isValidRwPhone(phone)) throw new Error('Enter a valid Rwanda phone number, for example 0788 123 456.');
    try {
      const code = await rpc<string>('create_staff_invite', { p_employee_name: form.name.trim(), p_phone: phone, p_role: form.role });
      if (!code) throw new Error('The database did not return an invite code.');
      return { code: String(code), name: form.name.trim(), phone, role: form.role };
    } catch (err) {
      const e = err as Error & { code?: string; cause?: { details?: string; hint?: string } };
      // Keep the full database message visible: it is what we need to fix the database function.
      setInviteError([e.message, e.code && `code ${e.code}`, e.cause?.details, e.cause?.hint].filter(Boolean).join(' · '));
      throw err;
    }
  }, { invalidate: ['staff_invites'] });

  const setActive = useAction(async ({ emp, active }: { emp: Employee; active: boolean }) => rpc('set_employee_active', { p_employee_id: emp.id, p_active: active }),
    { invalidate: ['employees'], success: (_r) => 'Staff access updated' });

  function submit(e: FormEvent) {
    e.preventDefault();
    invite.mutate(undefined as never, { onSuccess: r => { setOpen(false); setCreated(r); } });
  }

  const shareText = (c: NonNullable<typeof created>) =>
    `Hello ${c.name}, you are invited to join our shop on Kivu POS as ${ROLE_LABELS[c.role]}.\n\n1. Open ${window.location.href.split('#')[0]}\n2. Choose "Create account" → "Staff"\n3. Enter invite code ${c.code}, your name and this phone number (${c.phone})\n4. Choose a 6-digit PIN — you will use it to sign in.\n\nThe code expires in 14 days.`;

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } catch { toast('warning', 'Copy failed', 'Select the code and copy it manually.'); }
  }

  return (
    <>
      <PageHeader
        title="Staff & roles"
        description="Give each person their own sign-in. What they can see and do depends on their role."
        actions={can('invite_staff') && <Button variant="primary" icon={<UserPlus />} onClick={() => { setForm({ name: '', phone: '', role: 'cashier' }); setInviteError(null); setOpen(true); }}>Invite staff</Button>}
      />

      {can('invite_staff') && pending.length > 0 && (
        <Card title="Pending invites" description="Share the code with the person. It works once and expires after 14 days." className="mb-4" bodyClassName="p-0">
          <ul className="divide-y divide-zinc-100">
            {pending.map(i => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{i.employee_name} <span className="font-normal text-zinc-500">· {ROLE_LABELS[i.role] ?? i.role}</span></p>
                  <p className="text-xs text-zinc-500">{i.phone} · expires {formatDate(i.expires_at)}</p>
                </div>
                <span className="rounded-lg bg-zinc-100 px-2.5 py-1 font-mono text-sm font-semibold tracking-widest">{i.code}</span>
                <Button size="sm" variant="ghost" onClick={() => setCreated({ code: i.code, name: i.employee_name, phone: i.phone, role: i.role })}>Share</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Team" bodyClassName="p-0">
        {employees.isLoading ? <Spinner /> : !(employees.data ?? []).length ? (
          <EmptyState icon={<Users />} title="No staff yet" description="Invite cashiers, managers or stock clerks. Each one signs in with their phone number and their own PIN." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px]">
              <thead><tr><th className="th">Name</th><th className="th">Role</th><th className="th">Phone</th><th className="th">Access</th><th className="th" /></tr></thead>
              <tbody>
                {(employees.data ?? []).map(emp => (
                  <tr key={emp.id}>
                    <td className="td font-medium">{emp.name}</td>
                    <td className="td">{ROLE_LABELS[emp.role] ?? emp.role}</td>
                    <td className="td text-zinc-600">{emp.phone || '—'}</td>
                    <td className="td">{emp.active ? <Badge tone="good">Active</Badge> : <Badge>Disabled</Badge>}</td>
                    <td className="td text-right">
                      {can('manage_staff') && emp.user_id !== session.user.id && emp.role !== 'owner' && (
                        <Button size="sm" variant={emp.active ? 'subtle-danger' : 'secondary'} loading={setActive.isPending && setActive.variables?.emp.id === emp.id}
                          onClick={async () => {
                            if (emp.active && !(await confirm({ title: `Disable ${emp.name}?`, message: 'They will be signed out and cannot sign in until you reactivate them.', confirmLabel: 'Disable', danger: true }))) return;
                            setActive.mutate({ emp, active: !emp.active });
                          }}>
                          {emp.active ? 'Disable' : 'Reactivate'}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="What each role can do" className="mt-4">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(['owner', ...INVITABLE_ROLES] as Role[]).map(r => (
            <div key={r} className="rounded-xl border border-zinc-200 p-4">
              <dt className="text-sm font-semibold">{ROLE_LABELS[r]}</dt>
              <dd className="mt-1 text-[13px] leading-relaxed text-zinc-600">{ROLE_DESCRIPTIONS[r]}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} title="Invite a staff member" description="They join with this code on their own phone and choose their own 6-digit PIN."
        footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" type="submit" form="invite-form" loading={invite.isPending}>Create invite</Button></>}>
        <form id="invite-form" className="grid gap-4" onSubmit={submit}>
          <Field label="Full name"><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus required /></Field>
          <Field label="Phone number" hint="They will sign in with this number."><Input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="0788 123 456" required /></Field>
          <Field label="Role" hint={ROLE_DESCRIPTIONS[form.role]}>
            <Select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as Role }))}>{INVITABLE_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</Select>
          </Field>
          {inviteError && <Notice tone="bad"><b>The database refused the invite.</b><br /><span className="break-words font-mono text-xs">{inviteError}</span></Notice>}
        </form>
      </Dialog>

      <Dialog open={!!created} onClose={() => setCreated(null)} title="Invite ready" description={created ? `Send this to ${created.name}.` : undefined}
        footer={created && <>
          <a className="inline-flex" href={`https://wa.me/${created.phone.replace(/\D/g, '')}?text=${encodeURIComponent(shareText(created))}`} target="_blank" rel="noreferrer"><Button icon={<MessageCircle />}>Send on WhatsApp</Button></a>
          <Button variant="primary" icon={copied ? <Check /> : <Copy />} onClick={() => copy(shareText(created))}>{copied ? 'Copied' : 'Copy message'}</Button>
        </>}>
        {created && (
          <div className="space-y-4 text-center">
            <p className="font-mono text-4xl font-bold tracking-[0.3em]">{created.code}</p>
            <p className="text-sm text-zinc-600">{created.name} · {ROLE_LABELS[created.role]} · {created.phone}</p>
            <ol className="space-y-1.5 rounded-xl bg-zinc-50 p-4 text-left text-[13px] text-zinc-700">
              <li>1. They open Kivu POS and choose <b>Create account → Staff</b>.</li>
              <li>2. They enter this code, their name and <b>{created.phone}</b>.</li>
              <li>3. They choose a 6-digit PIN and are signed in straight away.</li>
            </ol>
          </div>
        )}
      </Dialog>
    </>
  );
}
