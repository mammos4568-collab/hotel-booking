// ทุกหน้าเรียก API ผ่านฟังก์ชันนี้ — ถ้าต้องแนบ token ภายหลัง (C) แก้ที่เดียว
export async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
  return data;
}
