import React from 'react';
import { NavLink } from 'react-router-dom';
import { CalendarCheck2, ClipboardList, LayoutDashboard } from 'lucide-react';

const navItem =
  'flex items-center gap-3 border border-gray-200 dark:border-darkCard border-r-0 px-3 py-2 rounded-l hover:bg-gray-50 dark:hover:bg-white/5 transition';

const active =
  'bg-indigo-50 border-indigo-300 text-indigo-700 dark:bg-indigo-600/30 dark:text-white dark:border-indigo-500';

export default function Sidebar() {
  return (
    <aside className="w-[18%] min-h-screen border-r-2 border-gray-200 dark:border-darkCard">
      <nav className="flex flex-col gap-3 pt-6 pl-[20%] text-[15px]">
        <NavLink
          to="/approvals"
          className={({ isActive }) => `${navItem} ${isActive ? active : ''}`}
        >
          <LayoutDashboard className="w-5 h-5" />
          <p className="hidden md:block">Approvals</p>
        </NavLink>

        <NavLink
          to="/marketplace-jobs"
          className={({ isActive }) => `${navItem} ${isActive ? active : ''}`}
        >
          <ClipboardList className="w-5 h-5" />
          <p className="hidden md:block">Requests</p>
        </NavLink>

        <NavLink
          to="/marketplace-bookings"
          className={({ isActive }) => `${navItem} ${isActive ? active : ''}`}
        >
          <CalendarCheck2 className="w-5 h-5" />
          <p className="hidden md:block">Bookings</p>
        </NavLink>
      </nav>
    </aside>
  );
}
