import { useLocation } from 'react-router-dom';
import { NAV } from '../components/Layout';

const WHAT: Record<string, string> = {
  '/map': 'מפת הקומה עם המושבים, לפי יום ולפי יחידה.',
  '/free': 'לוח המקומות הפנויים לכל יום בשבוע, לפי חדר.',
  '/reports': 'דוחות תפוסה, שיבוץ וניצולת, עם הורדה לאקסל.',
  '/org': 'עץ היחידות והאנשים, עם העברה בגרירה.',
  '/data': 'אתרים, קומות, חדרים, אנשים, וייבוא מאקסל.',
  '/settings': 'מתגי יכולות והגדרות כלליות.',
};

export default function ComingSoon() {
  const { pathname } = useLocation();
  const item = NAV.find((n) => n.to === pathname);
  return (
    <section className="narrow">
      <h1>{item?.label ?? 'בקרוב'}</h1>
      <p className="lead">{WHAT[pathname] ?? 'המסך הזה עוד בבנייה.'}</p>
      <p className="muted">המסך הזה עוד בבנייה.</p>
    </section>
  );
}
