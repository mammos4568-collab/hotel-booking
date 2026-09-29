// ทุกหน้าเรียก API ผ่านฟังก์ชันนี้ — ถ้าต้องแนบ token ภายหลัง (C) แก้ที่เดียว
export async function api(path, options = {}) {
  const hasBody = options.body !== undefined;
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    },
    ...options,
    body: hasBody ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.message || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}
