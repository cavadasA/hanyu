import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';

export default function Layout() {
  return (
    <div className="flex min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <Navbar />
      <main className="flex-1 overflow-auto p-6 pb-20 md:pb-6">
        <Outlet />
      </main>
    </div>
  );
}