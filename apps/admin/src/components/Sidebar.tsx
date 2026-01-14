import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  PackagePlus,
  Layers,
  CreditCard,
  FileText,
  Users,
  BookOpenCheck,
  Video,
  BadgeCheck,
} from 'lucide-react';

const navItem =
  'flex items-center gap-3 border border-gray-200 dark:border-darkCard border-r-0 px-3 py-2 rounded-l hover:bg-gray-50 dark:hover:bg-white/5 transition';

const active =
  'bg-indigo-50 border-indigo-300 text-indigo-700 dark:bg-indigo-600/30 dark:text-white dark:border-indigo-500';

export default function Sidebar() {
  return (
    <aside className="w-[18%] min-h-screen border-r-2 border-gray-200 dark:border-darkCard">
      <nav className="flex flex-col gap-3 pt-6 pl-[20%] text-[15px]">
        <NavLink
          to="/oer/openstax-ingest"
          className={({ isActive }) => `${navItem} ${isActive ? active : ''}`}
        >
          <BookOpenCheck className="w-5 h-5" />
          <p className="hidden md:block">OpenStax Ingest</p>
        </NavLink>

        <NavLink
          to="/oer/youtube-ingest"
          className={({ isActive }) => `${navItem} ${isActive ? active : ''}`}
        >
          <Video className="w-5 h-5" />
          <p className="hidden md:block">YouTube Ingest</p>
        </NavLink>

        <NavLink
          to="/packages/create"
          className={({ isActive }) => `${navItem} ${isActive ? active : ''}`}
        >
          <PackagePlus className="w-5 h-5" />
          <p className="hidden md:block">Create Package</p>
        </NavLink>

        <NavLink
          to="/packages"
          className={({ isActive }) => `${navItem} ${isActive ? active : ''}`}
        >
          <Layers className="w-5 h-5" />
          <p className="hidden md:block">Manage Packages</p>
        </NavLink>

        <NavLink
          to="/transactions"
          className={({ isActive }) => `${navItem} ${isActive ? active : ''}`}
        >
          <CreditCard className="w-5 h-5" />
          <p className="hidden md:block">Transactions</p>
        </NavLink>

        <NavLink
          to="/receipts"
          className={({ isActive }) => `${navItem} ${isActive ? active : ''}`}
        >
          <FileText className="w-5 h-5" />
          <p className="hidden md:block">Receipts</p>
        </NavLink>

        <NavLink to="/users" className={({ isActive }) => `${navItem} ${isActive ? active : ''}`}>
          <Users className="w-5 h-5" />
          <p className="hidden md:block">Users</p>
        </NavLink>

        <NavLink
          to="/certifications"
          className={({ isActive }) => `${navItem} ${isActive ? active : ''}`}
        >
          <BadgeCheck className="w-5 h-5" />
          <p className="hidden md:block">Certifications</p>
        </NavLink>
      </nav>
    </aside>
  );
}
