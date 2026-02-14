"use client";

import React from 'react';

type StablePageShellProps = {
  children: React.ReactNode;
  className?: string;
  mainClassName?: string;
};

export default function StablePageShell({
  children,
  className = '',
  mainClassName = '',
}: StablePageShellProps) {
  return (
    <div className={`min-h-screen ${className}`.trim()}>
      <main className={mainClassName}>{children}</main>
    </div>
  );
}
