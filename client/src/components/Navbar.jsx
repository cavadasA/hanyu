import { NavLink } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';

const links = [
  { to: '/', label: '仪表盘', desc: 'Overview', mobile: '仪' },
  { to: '/flashcards', label: '卡片', desc: 'Flashcards', mobile: '卡' },
  { to: '/exercises', label: '练习', desc: 'Exercises', mobile: '练' },
  { to: '/readings', label: '阅读', desc: 'Readings', mobile: '读' },
  { to: '/grammar', label: '语法', desc: 'Grammar', mobile: '法' },
  { to: '/words', label: '词汇', desc: 'Words', mobile: '词' },
  { to: '/settings', label: '设置', desc: 'Settings', mobile: '设' },
];

function linkClass({ isActive }) {
  return `rounded-xl px-3 py-3 text-left transition-colors ${
    isActive
      ? 'bg-[var(--color-vermilion)] text-white'
      : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg)]'
  }`;
}

export default function Navbar() {
  return (
    <>
      <nav className="hidden min-h-screen w-64 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] p-4 md:flex">
        <div className="mb-8 flex items-center gap-3">
          <span className="text-2xl font-bold text-[var(--color-vermilion)]">汉语</span>
          <span className="text-sm uppercase tracking-[0.2em] text-[var(--color-text-muted)]">Hanyu</span>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-2">
          {links.map(({ to, label, desc }) => (
            <NavLink key={to} to={to} end={to === '/'} className={linkClass}>
              <span className="block font-semibold">{label}</span>
              <span className="block text-xs opacity-80">{desc}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      <nav className="fixed bottom-0 left-0 right-0 z-50 flex justify-around border-t border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-2 md:hidden">
        {links.slice(0, 5).map(({ to, mobile }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `rounded-lg px-3 py-2 text-sm font-semibold ${
                isActive ? 'bg-[var(--color-vermilion)] text-white' : 'text-[var(--color-text-muted)]'
              }`
            }
          >
            {mobile}
          </NavLink>
        ))}
      </nav>
    </>
  );
}