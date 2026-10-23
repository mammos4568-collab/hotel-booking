// ทุกหน้าเรียก API ผ่านฟังก์ชันนี้ — ถ้าต้องแนบ token ภายหลัง (C) แก้ที่เดียว
// body เป็น object → ส่งเป็น JSON · เป็นไฟล์ (Blob เช่น รูปที่ย่อแล้ว) → ส่งไบต์ตรงๆ ตามชนิดไฟล์
export async function api(path, options = {}) {
  const hasBody = options.body !== undefined;
  const isFile = options.body instanceof Blob;
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: {
      ...(hasBody ? { 'Content-Type': isFile ? options.body.type : 'application/json' } : {}),
    },
    ...options,
    body: hasBody ? (isFile ? options.body : JSON.stringify(options.body)) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.message || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}
