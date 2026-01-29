// components/Spinner.jsx
import React from 'react';

const Spinner = () => {
  return (
    <div className="flex items-center justify-center">
      {/* This div creates a spinner using Tailwind CSS */}
      <div className="w-12 h-12 border-4 border-t-4 border-gray-300 border-t-softPink rounded-full animate-spin"></div>
    </div>
  );
};

export default Spinner;
