// [A] รายละเอียดโรงแรม + ประเภทห้อง (ปุ่ม "จอง" ส่งต่อให้ B)
import { useParams } from 'react-router-dom';

export default function HotelDetailPage() {
  const { id } = useParams();
  return <h1>TODO(A): รายละเอียดโรงแรม #{id}</h1>;
}
