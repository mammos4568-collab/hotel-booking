// หลังบ้าน (admin เท่านั้น): ผู้ใช้และสิทธิ์ — เปลี่ยนบทบาท ลูกค้า ↔ เจ้าของโรงแรม
// กฎที่ server บังคับ: ตั้ง/ถอดผู้ดูแลระบบได้จาก server/scripts/set-role.js เท่านั้น (หน้าเว็บแตะบัญชี admin ไม่ได้)
// · เปลี่ยนบทบาทตัวเองไม่ได้ · เลิกเป็น owner = ถอดจากโรงแรมที่ดูแล
import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Icon from '../../components/Icon.jsx';
import { PageLoader } from '../../components/Loading.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { formatDate } from '../../lib/format.js';
import { Field, Notice, PageHeader, Pagination, ROLE_META, RoleBadge, card, inputClass, useAdminData } from './adminUi.jsx';

// บทบาทที่เลือกได้ในหน้าเว็บ (ตรงกับ WEB_ROLES ใน server/src/modules/admin/users.js)
const ROLE_HELP = {
  user: { th: 'จองที่พักได้อย่างเดียว ไม่มีสิทธิ์เข้าหลังบ้าน', en: 'Can book stays only — no back-office access' },
  owner: { th: 'จัดการได้เฉพาะโรงแรมที่ตั้งให้เป็นเจ้าของ (ตั้งที่หน้าแก้ไขโรงแรม)', en: 'Manages only the hotels assigned to them (set on the hotel page)' },
};

export default function UsersPage() {
  const { lang, tx } = useLanguage();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ q: '', role: '', page: 1 });
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString();
  const { data, error, loading, reload } = useAdminData(`/admin/users?${query}`);
  const [change, setChange] = useState(null); // { user, role }
  const [state, setState] = useState({ loading: false, error: '' });
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setFilters((prev) => (prev.q === search.trim() ? prev : { ...prev, q: search.trim(), page: 1 })), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const close = () => {
    setChange(null);
    setState({ loading: false, error: '' });
  };
  const confirmChange = async () => {
    setState({ loading: true, error: '' });
    try {
      const result = await api(`/admin/users/${change.user.id}/role`, { method: 'PATCH', body: { role: change.role } });
      const roleName = tx(ROLE_META[change.role].th, ROLE_META[change.role].en);
      setNotice(result.unassignedHotels
        ? tx(`${change.user.name} เป็น${roleName}แล้ว และถูกถอดจากโรงแรม ${result.unassignedHotels} แห่ง`, `${change.user.name} is now ${roleName} and was removed from ${result.unassignedHotels} hotels`)
        : tx(`${change.user.name} เป็น${roleName}แล้ว — มีผลทันทีโดยไม่ต้องล็อกอินใหม่`, `${change.user.name} is now ${roleName} — effective immediately`));
      close();
      reload();
    } catch (err) {
      setState({ loading: false, error: err.message });
    }
  };

  return (
    <div>
      <PageHeader
        title={tx('ผู้ใช้และสิทธิ์', 'Users & roles')}
        description={tx(
          'ตั้งหรือถอดเจ้าของโรงแรม — ผู้ดูแลระบบตั้ง/ถอดได้จากคำสั่งบน server เท่านั้น (server/scripts/set-role.js)',
          'Assign or remove hotel owners — admins can only be added or removed from the server command line (server/scripts/set-role.js)',
        )}
      />

      <div className={`${card} mb-4 flex flex-wrap items-end gap-3 p-4`}>
        <Field label={tx('ค้นหา', 'Search')} className="w-full sm:w-72">
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tx('ชื่อหรืออีเมล', 'Name or email')} className={inputClass} />
        </Field>
        <Field label={tx('บทบาท', 'Role')} className="w-full sm:w-48">
          <select value={filters.role} onChange={(event) => setFilters({ ...filters, role: event.target.value, page: 1 })} className={inputClass}>
            <option value="">{tx('ทุกบทบาท', 'All roles')}</option>
            {Object.entries(ROLE_META).map(([key, meta]) => <option key={key} value={key}>{tx(meta.th, meta.en)}</option>)}
          </select>
        </Field>
      </div>

      {notice && <div className="mb-4"><Notice tone="success">{notice}</Notice></div>}
      {error && <Notice>{error}</Notice>}
      {!data ? (
        !error && <PageLoader />
      ) : data.users.length === 0 ? (
        <EmptyState icon="users" title={tx('ไม่พบผู้ใช้', 'No users found')} />
      ) : (
        <div className={`transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <ul className={`${card} divide-y divide-slate-100 overflow-hidden`}>
            {data.users.map((user) => (
              <li key={user.id} className="grid gap-3 px-4 py-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-bold text-slate-900">
                    <span className="truncate">{user.name}</span>
                    <RoleBadge role={user.role} />
                    {user.isMe && <span className="text-xs font-semibold text-slate-400">({tx('คุณ', 'you')})</span>}
                  </p>
                  <p className="truncate text-sm text-slate-500">{user.email}</p>
                </div>
                <p className="text-xs text-slate-500 sm:text-right">
                  {tx(`จอง ${user.bookings} ครั้ง`, `${user.bookings} bookings`)}
                  {user.hotels > 0 && <> · {tx(`ดูแล ${user.hotels} โรงแรม`, `owns ${user.hotels} hotels`)}</>}
                  <span className="block">{tx('สมัครเมื่อ', 'Joined')} {formatDate(user.createdAt, lang)}</span>
                </p>
                {user.role === 'admin' ? (
                  // บัญชี admin (รวมตัวเอง) เปลี่ยนจากหน้าเว็บไม่ได้ — server ก็ปฏิเสธ (403) ถ้ายิง API ตรง
                  <p className="flex items-center gap-1.5 text-xs text-slate-500 sm:w-44 sm:justify-end">
                    <Icon name="lock" className="h-3.5 w-3.5 shrink-0" />{tx('เปลี่ยนได้จากคำสั่งบน server', 'Server command line only')}
                  </p>
                ) : (
                  <select
                    value={user.role}
                    onChange={(event) => { setNotice(''); setChange({ user, role: event.target.value }); }}
                    aria-label={tx(`บทบาทของ ${user.name}`, `Role for ${user.name}`)}
                    className={`${inputClass} sm:w-44`}
                  >
                    {Object.keys(ROLE_HELP).map((key) => <option key={key} value={key}>{tx(ROLE_META[key].th, ROLE_META[key].en)}</option>)}
                  </select>
                )}
              </li>
            ))}
          </ul>
          <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onChange={(page) => setFilters({ ...filters, page })} />
        </div>
      )}

      <ConfirmDialog
        open={Boolean(change)}
        tone={change?.role === 'user' ? 'danger' : 'info'}
        title={change ? tx(`เปลี่ยน ${change.user.name} เป็น${ROLE_META[change.role].th}?`, `Make ${change.user.name} ${ROLE_META[change.role].en}?`) : ''}
        message={change && (
          <div className="space-y-2">
            <p>{tx(ROLE_HELP[change.role].th, ROLE_HELP[change.role].en)}</p>
            {change.user.role === 'owner' && change.user.hotels > 0 && (
              <p className="font-semibold text-rose-700">{tx(`จะถูกถอดจากโรงแรมที่ดูแล ${change.user.hotels} แห่ง (กลับไปให้ผู้ดูแลระบบดูแล)`, `They will be removed from ${change.user.hotels} hotels (admins take over)`)}</p>
            )}
          </div>
        )}
        confirmLabel={tx('เปลี่ยนบทบาท', 'Change role')}
        loading={state.loading}
        error={state.error}
        onConfirm={confirmChange}
        onClose={close}
      />
    </div>
  );
}
