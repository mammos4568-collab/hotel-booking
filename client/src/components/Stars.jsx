import Icon from './Icon.jsx';

// ระดับดาวของโรงแรม (รองรับครึ่งดาว เช่น 4.5)
export default function Stars({ value = 0, className = 'w-3.5 h-3.5' }) {
  const stars = Number(value) || 0;
  const full = Math.floor(stars);
  const half = stars - full >= 0.5;
  if (!stars) return null;

  return (
    <span className="inline-flex items-center gap-0.5 text-amber-400" aria-label={`${stars} stars`} title={`${stars} ★`}>
      {Array.from({ length: full }).map((_, i) => (
        <Icon key={i} name="star" filled strokeWidth={1.5} className={className} />
      ))}
      {half && (
        <span className="relative inline-flex">
          <Icon name="star" filled strokeWidth={1.5} className={`${className} text-amber-200`} />
          <span className="absolute inset-y-0 left-0 w-1/2 overflow-hidden">
            <Icon name="star" filled strokeWidth={1.5} className={className} />
          </span>
        </span>
      )}
    </span>
  );
}
