// apps/web/src/components/RequestDataDeletionForm.web.tsx

import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconProp } from '@fortawesome/fontawesome-svg-core';
import {
  faUser,
  faEnvelope,
  faClipboardList,
  faPaperPlane,
} from '@fortawesome/free-solid-svg-icons';
import { toast } from 'react-toastify';

const RequestDataDeletionForm: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      toast.error('Please fill in your name and email.');
      return;
    }
    setSubmitting(true);
    const subject = encodeURIComponent('Request for Personal Data Deletion');
    const bodyLines = [
      `Hello DayBreak Data Privacy Team,`,
      ``,
      `My name: ${name}`,
      `Email: ${email}`,
      ``,
      `I hereby request deletion of all my personal data from your systems.`,
      details.trim() ? `\nDetails:\n${details}` : '',
      ``,
      `Thank you,`,
      `${name}`,
    ];
    const body = encodeURIComponent(bodyLines.join('\n'));
    window.location.href = `mailto:info@DayBreak.co.ke?subject=${subject}&body=${body}`;
    toast.info('Opening your email client...');
    setSubmitting(false);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-lg mx-auto bg-gray-800 text-white rounded-xl shadow-lg p-6 space-y-6"
    >
      <h2 className="text-2xl font-bold text-center text-blue-400">
        Request Personal Data Deletion
      </h2>

      {/* Name */}
      <div className="flex items-center bg-gray-700 rounded-lg px-4 py-2">
        <FontAwesomeIcon icon={faUser as IconProp} className="text-gray-400 mr-3" />
        <input
          type="text"
          placeholder="Your Full Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 bg-transparent focus:outline-none placeholder-gray-400 text-white"
          required
        />
      </div>

      {/* Email */}
      <div className="flex items-center bg-gray-700 rounded-lg px-4 py-2">
        <FontAwesomeIcon icon={faEnvelope as IconProp} className="text-gray-400 mr-3" />
        <input
          type="email"
          placeholder="Your Email Address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 bg-transparent focus:outline-none placeholder-gray-400 text-white"
          required
        />
      </div>

      {/* Details */}
      <div className="flex items-start bg-gray-700 rounded-lg px-4 py-2">
        <FontAwesomeIcon icon={faClipboardList as IconProp} className="text-gray-400 mr-3 mt-1" />
        <textarea
          placeholder="Additional details (optional)"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          className="flex-1 bg-transparent focus:outline-none placeholder-gray-400 text-white resize-none h-24"
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting}
        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-semibold px-6 py-3 rounded-xl shadow-lg transition-transform hover:-translate-y-1 disabled:opacity-50"
      >
        <FontAwesomeIcon icon={faPaperPlane as IconProp} />
        {submitting ? 'Please wait…' : 'Send Deletion Request'}
      </button>
    </form>
  );
};

export default RequestDataDeletionForm;
