// นโยบายความเป็นส่วนตัว (PDPA) — เขียนตามสิ่งที่ระบบทำจริงในโปรเจกต์นี้
// แก้ระบบเรื่องข้อมูลส่วนบุคคลเมื่อไหร่ ต้องกลับมาแก้หน้านี้ให้ตรงด้วย
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { formatDate } from '../../lib/format.js';

const LAST_UPDATED = '2026-10-24';
const CONTACT_EMAIL = 'privacy@hotelbooking.example';

function Section({ id, icon, title, children }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-3xl border border-slate-200 bg-white p-6 sm:p-7">
      <h2 className="flex items-center gap-3 text-lg font-extrabold text-slate-900">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <Icon name={icon} className="h-5 w-5" />
        </span>
        {title}
      </h2>
      <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-600">{children}</div>
    </section>
  );
}

function Bullets({ items }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={typeof item === 'string' ? item : item.key} className="flex gap-2.5">
          <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <span>{typeof item === 'string' ? item : item.node}</span>
        </li>
      ))}
    </ul>
  );
}

export default function PrivacyPage() {
  const { lang, tx } = useLanguage();

  const sections = [
    { id: 'collect', icon: 'user', title: tx('ข้อมูลที่เราเก็บ', 'Information we collect') },
    { id: 'purpose', icon: 'info', title: tx('เราใช้ข้อมูลทำอะไร', 'How we use it') },
    { id: 'share', icon: 'globe', title: tx('การเปิดเผยข้อมูล', 'Sharing') },
    { id: 'retention', icon: 'clock', title: tx('ระยะเวลาเก็บข้อมูล', 'Retention') },
    { id: 'security', icon: 'shield', title: tx('การรักษาความปลอดภัย', 'Security') },
    { id: 'rights', icon: 'receipt', title: tx('สิทธิของคุณ', 'Your rights') },
    { id: 'cookies', icon: 'sliders', title: tx('คุกกี้และการจัดเก็บในเบราว์เซอร์', 'Cookies & local storage') },
    { id: 'contact', icon: 'mail', title: tx('ติดต่อเรา', 'Contact us') },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <header className="rounded-[2rem] bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 p-7 text-white shadow-xl shadow-brand-900/15 sm:p-10">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
          <Icon name="shield" className="h-3.5 w-3.5" /> PDPA
        </span>
        <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">{tx('นโยบายความเป็นส่วนตัว', 'Privacy Policy')}</h1>
        <p className="mt-2 max-w-2xl text-white/85">
          {tx(
            'เราเก็บและใช้ข้อมูลส่วนบุคคลของคุณเท่าที่จำเป็นต่อการจองที่พัก ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)',
            "We collect and use your personal data only as needed to book your stay, in line with Thailand's Personal Data Protection Act B.E. 2562 (PDPA).",
          )}
        </p>
        <p className="mt-4 text-xs text-white/70">{tx('ปรับปรุงล่าสุด', 'Last updated')} {formatDate(LAST_UPDATED, lang, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </header>

      <p className="mt-5 flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0" />
        {tx(
          'นี่คือนโยบายตัวอย่างของโปรเจกต์รายวิชา ข้อมูลโรงแรมและการชำระเงินเป็นการจำลอง',
          'This is a sample policy for a course project. Hotel data and payments are simulated.',
        )}
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[14rem_1fr]">
        <nav className="hidden lg:block">
          <ul className="sticky top-24 space-y-1 text-sm">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="block rounded-xl px-3 py-2 font-medium text-slate-600 transition hover:bg-white hover:text-brand-700">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-5">
          <Section {...sections[0]}>
            <Bullets
              items={[
                tx('บัญชีผู้ใช้: ชื่อ-นามสกุล อีเมล รหัสผ่าน (เก็บแบบเข้ารหัสทางเดียว ไม่มีใครเห็นรหัสจริง) เบอร์โทรถ้าคุณกรอก รูปโปรไฟล์ถ้าคุณอัปโหลด (หรือรูปจากบัญชี Google/GitHub ตอนสมัครด้วยช่องทางนั้น) และบัญชี Google/GitHub ที่คุณเลือกเชื่อม',
                  'Account: name, email, password (stored as a one-way hash), phone if you add it, a profile photo if you upload one (or the photo from Google/GitHub when you sign up that way), and any Google/GitHub account you choose to link.'),
                tx('รูปโปรไฟล์ที่อัปโหลด: เบราว์เซอร์ย่อเป็น 400×400 และลบข้อมูลแฝงในไฟล์ (เช่น พิกัด GPS ที่ถ่าย) ก่อนส่งมาเก็บในระบบของเรา · แสดงต่อสาธารณะคู่กับรีวิวที่คุณเขียน โดยลิงก์รูปเป็นรหัสสุ่มที่เดาไม่ได้ · ลบเองได้ทุกเมื่อที่หน้าโปรไฟล์ และถูกลบทันทีเมื่อลบบัญชี',
                  'Uploaded profile photo: your browser resizes it to 400×400 and strips hidden file data (such as GPS location) before it reaches us · it is shown publicly next to reviews you write, behind an unguessable link · remove it anytime on your profile page; it is deleted immediately with your account.'),
                tx('การจอง: ชื่อผู้เข้าพัก อีเมล เบอร์โทร (ไม่บังคับ) คำขอพิเศษ วันเข้าพัก และจำนวนผู้เข้าพัก',
                  'Bookings: guest name, email, phone (optional), special requests, stay dates and number of guests.'),
                tx('การชำระเงิน: วิธีชำระ ยอดเงิน เวลา และเลข 4 หลักท้ายของบัตรเท่านั้น — เราไม่เก็บเลขบัตรเต็ม วันหมดอายุ หรือรหัส CVC และไม่เก็บเบอร์ที่กรอกตอนจ่ายด้วย TrueMoney Wallet',
                  'Payments: method, amount, time and only the last 4 digits of your card — we never store the full card number, expiry date or CVC, nor the phone number you enter for TrueMoney Wallet.'),
                tx('รีวิว: คะแนนและความคิดเห็นที่คุณเขียน ซึ่งแสดงต่อสาธารณะพร้อมชื่อแบบย่อ (เช่น "Ploy S.")',
                  'Reviews: your rating and comment, shown publicly with a shortened name (e.g. "Ploy S.").'),
                tx('รายการโปรด: ที่พักที่คุณกดหัวใจเก็บไว้ และเวลาที่กด — ลบได้ทุกเมื่อ และลบทั้งหมดเมื่อลบบัญชี',
                  'Favourites: the properties you save and when you saved them — remove them anytime; all are deleted with your account.'),
                tx('ผู้ช่วยหาที่พัก (แชท): ข้อความที่คุณพิมพ์ใช้ตอบคำถามทันทีเท่านั้น ไม่บันทึกลงฐานข้อมูลหรือ log ไม่ส่งให้บริการภายนอก และหายไปเมื่อรีเฟรชหน้า — ไม่ควรพิมพ์ข้อมูลส่วนตัวลงในแชท',
                  'Stay assistant (chat): what you type is used only to answer you right away — it is not saved to our database or logs, not sent to any third party, and disappears when you reload the page. Please do not type personal details into the chat.'),
                tx('เจ้าของโรงแรมและผู้ดูแลระบบ (หลังบ้าน): โรงแรมที่ดูแล และบันทึกการทำงาน (ใครแก้อะไร เมื่อไร) เพื่อตรวจสอบย้อนหลัง',
                  'Hotel owners and admins (back office): the properties they manage and an activity log (who changed what, and when) for accountability.'),
              ]}
            />
          </Section>

          <Section {...sections[1]}>
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">{tx('วัตถุประสงค์', 'Purpose')}</th>
                    <th className="px-4 py-3">{tx('ฐานทางกฎหมาย (PDPA)', 'Legal basis (PDPA)')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="px-4 py-3">{tx('ทำการจอง ชำระเงิน ยกเลิก และให้บริการเข้าพัก', 'Making, paying for and cancelling your booking; providing your stay')}</td>
                    <td className="px-4 py-3">{tx('การปฏิบัติตามสัญญา (มาตรา 24(3))', 'Performance of a contract (Section 24(3))')}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">{tx('ป้องกันการทุจริตและการใช้งานผิดปกติ เช่น จำกัดคำขอที่ถี่เกินไป จำกัดการจ่ายเงินผิดซ้ำๆ', 'Preventing fraud and abuse, e.g. rate limits and limits on repeated failed payments')}</td>
                    <td className="px-4 py-3">{tx('ประโยชน์โดยชอบด้วยกฎหมาย (มาตรา 24(5))', 'Legitimate interests (Section 24(5))')}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>{tx('เราไม่ใช้ข้อมูลของคุณเพื่อส่งโฆษณาหรือการตลาด หากจะทำในอนาคตจะขอความยินยอมจากคุณก่อน', 'We do not use your data for advertising or marketing. If we ever do, we will ask for your consent first.')}</p>
          </Section>

          <Section {...sections[2]}>
            <Bullets
              items={[
                tx('ข้อมูลผู้เข้าพักใช้เพื่อการเข้าพักกับที่พักที่คุณจองเท่านั้น เราไม่ขายข้อมูลส่วนบุคคลให้ใคร', 'Guest details are used only for your stay at the property you booked. We never sell personal data.'),
                tx('จ่ายด้วย TrueMoney ผ่าน Opn Payments (ผู้ให้บริการรับชำระเงิน — ในโปรเจกต์นี้ใช้โหมดทดสอบ): เราส่งให้ Opn แค่ยอดเงินและเลขที่การจอง ส่วนการยืนยันตัวตนทำในแอป TrueMoney เราไม่ได้รับรหัสหรือข้อมูลบัญชีของคุณ',
                  'Paying with TrueMoney via Opn Payments (our payment processor — test mode in this project): we send Opn only the amount and booking reference; you confirm the payment in the TrueMoney app, and we never receive your wallet credentials or account details.'),
                tx('เจ้าของที่พักที่คุณจอง (และผู้ดูแลระบบ) เห็นชื่อ อีเมล เบอร์โทร และคำขอพิเศษของการจองนั้น เพื่อเตรียมการเข้าพักและติดต่อคุณ — เจ้าของแต่ละรายเห็นเฉพาะการจองของที่พักตัวเอง',
                  'The property you book (and our admins) can see the guest name, email, phone and special requests of that booking to prepare your stay and contact you — each owner sees only bookings for their own property.'),
                tx('หน้าเว็บโหลดไฟล์จากบริการภายนอก ได้แก่ ฟอนต์ (Google Fonts) รูปภาพ (Unsplash) แผนที่ (OpenStreetMap) ไอคอนธง (flagcdn) และรูปโปรไฟล์ที่มาจากบัญชี Google/GitHub (ถ้าเจ้าของยังไม่ได้อัปรูปเอง) ซึ่งจะเห็น IP address ของคุณตามปกติของการโหลดไฟล์',
                  'Pages load files from third parties — fonts (Google Fonts), photos (Unsplash), maps (OpenStreetMap), flag icons (flagcdn) and profile photos that come from Google/GitHub accounts (until their owner uploads one) — which can see your IP address as part of serving them.'),
              ]}
            />
          </Section>

          <Section {...sections[3]}>
            <Bullets
              items={[
                tx('ข้อมูลบัญชี: เก็บไว้ตลอดที่คุณยังมีบัญชีกับเรา', 'Account data: kept while your account exists.'),
                tx('ข้อมูลการจองและการชำระเงิน: เก็บเท่าที่จำเป็นต่อการให้บริการ การบัญชี และตามที่กฎหมายกำหนด', 'Booking and payment records: kept as long as needed to provide the service, for accounting, and as required by law.'),
                tx('การจองที่ยังไม่ชำระเงินจะถือห้องไว้ 15 นาที เกินเวลาจะถูกปิดอัตโนมัติ', 'Unpaid bookings hold a room for 15 minutes and are then closed automatically.'),
                tx('เมื่อลบบัญชี: บัญชีและรูปโปรไฟล์ถูกลบทันที ประวัติการจองเก็บไว้แบบระบุตัวตนไม่ได้ (ลบชื่อ อีเมล เบอร์ คำขอพิเศษ) และรีวิวยังแสดงแต่ไม่มีชื่อและรูปของคุณ',
                  'When you delete your account: it and your profile photo are removed immediately; past bookings are kept without anything that identifies you, and reviews stay without your name or photo.'),
                tx('บันทึกการทำงานในหลังบ้าน: เก็บไว้ตรวจสอบย้อนหลังโดยไม่มีข้อมูลส่วนตัวของลูกค้า — เมื่อเจ้าหน้าที่ลบบัญชี บันทึกยังอยู่แต่ไม่ผูกกับบัญชีนั้น และโรงแรมที่ดูแลกลับไปให้ผู้ดูแลระบบ',
                  'Back-office activity log: kept for accountability with no customer personal data — if a staff member deletes their account, entries stay but are no longer linked to them, and their properties go back to the admins.'),
              ]}
            />
          </Section>

          <Section {...sections[4]}>
            <Bullets
              items={[
                tx('รหัสผ่านเก็บแบบ bcrypt และสถานะการล็อกอินเก็บในคุกกี้แบบ HttpOnly ที่สคริปต์บนหน้าเว็บอ่านไม่ได้', 'Passwords are hashed with bcrypt; your session is kept in an HttpOnly cookie that page scripts cannot read.'),
                tx('ข้อมูลการจองดูได้เฉพาะเจ้าของบัญชี ที่พักที่จอง และผู้ดูแลระบบ — ตรวจสิทธิ์ที่เซิร์ฟเวอร์ทุกครั้ง และทุกการแก้ไขในหลังบ้านถูกบันทึกไว้', 'Bookings are visible only to the account holder, the booked property and admins — access is checked on the server every time, and every back-office change is logged.'),
                tx('จำกัดความถี่ของคำขอ จำกัดการจองที่รอชำระพร้อมกัน และยกเลิกการจองอัตโนมัติเมื่อจ่ายเงินผิดซ้ำหลายครั้ง', 'Request rate limits, a cap on simultaneous unpaid bookings, and automatic cancellation after repeated failed payments.'),
                tx('บันทึกข้อผิดพลาดของระบบ (log) ไม่บันทึกข้อมูลที่คุณกรอกในฟอร์ม คุกกี้ หรือรายละเอียดจากฐานข้อมูลที่อาจมีข้อมูลส่วนตัว', 'Server error logs do not record form data, cookies, or database details that may contain personal data.'),
              ]}
            />
          </Section>

          <Section {...sections[5]}>
            <p>{tx('ตาม PDPA คุณมีสิทธิ:', 'Under the PDPA you have the right to:')}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                tx('ขอเข้าถึงและขอรับสำเนาข้อมูล', 'Access and get a copy of your data'),
                tx('ขอแก้ไขข้อมูลให้ถูกต้อง', 'Correct inaccurate data'),
                tx('ขอลบหรือทำให้ข้อมูลไม่สามารถระบุตัวตนได้', 'Have your data deleted or anonymised'),
                tx('คัดค้านหรือขอระงับการใช้ข้อมูล', 'Object to or restrict processing'),
                tx('ขอให้โอนย้ายข้อมูล', 'Data portability'),
                tx('ร้องเรียนต่อสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล (สคส.)', 'Complain to the Personal Data Protection Committee (PDPC)'),
              ].map((right) => (
                <span key={right} className="rounded-xl bg-slate-50 px-3 py-2 font-medium text-slate-700">{right}</span>
              ))}
            </div>
            <p>
              {tx('ดาวน์โหลดสำเนาข้อมูลและลบบัญชีได้ด้วยตัวเองที่', 'Download your data or delete your account yourself on')}{' '}
              <Link to="/privacy/my-data" className="font-semibold text-brand-600 hover:underline">{tx('หน้าข้อมูลส่วนบุคคลของฉัน', 'My personal data')}</Link>
              {' '}{tx('· แก้ไขข้อมูลบัญชีได้ที่', '· update your details on the')}{' '}
              <Link to="/profile" className="font-semibold text-brand-600 hover:underline">{tx('หน้าโปรไฟล์', 'Profile page')}</Link>
              {' '}{tx('· คำขออื่นติดต่ออีเมลด้านล่าง', '· for anything else, email us below.')}
            </p>
          </Section>

          <Section {...sections[6]}>
            <Bullets
              items={[
                tx('คุกกี้ hotel_session: จำเป็นต่อการล็อกอิน อายุ 7 วัน ลบได้ด้วยการออกจากระบบ', 'hotel_session cookie: required to keep you signed in, lasts 7 days, removed when you sign out.'),
                tx('localStorage ในเบราว์เซอร์: จำภาษาและสกุลเงินที่คุณเลือก', 'Browser localStorage: remembers your language and currency.'),
                tx('เราไม่ใช้คุกกี้โฆษณาหรือคุกกี้ติดตามพฤติกรรม', 'We use no advertising or tracking cookies.'),
              ]}
            />
          </Section>

          <Section {...sections[7]}>
            <p>{tx('เจ้าหน้าที่คุ้มครองข้อมูลส่วนบุคคล (ตัวอย่าง)', 'Data protection contact (example)')}</p>
            <a href={`mailto:${CONTACT_EMAIL}`} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 font-semibold text-slate-800 hover:bg-slate-50">
              <Icon name="mail" className="h-4 w-4" /> {CONTACT_EMAIL}
            </a>
          </Section>
        </div>
      </div>
    </div>
  );
}
