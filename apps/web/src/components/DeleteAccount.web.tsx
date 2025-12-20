import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '@mytutorapp/shared/hooks';
import { FaTrashAlt, FaTimes } from 'react-icons/fa';

type Props = {
  triggerClassName?: string;
  label?: string;
};

const BACKUP_RETENTION_DAYS = 90;
const REQUIRED_TOKEN = 'DELETE';
const normalize = (s: string) => s.normalize('NFKC').trim().toUpperCase();

const ModalPortal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
};

const DeleteAccount: React.FC<Props> = ({ triggerClassName = '', label = 'Delete Account' }) => {
  const navigate = useNavigate();

  const { handleDeleteAccount, isDeleting, deleteError } = useAuth({
    alertFn: (msg: string) => toast.info(msg),
    navigateFn: (destination?: string) => navigate(destination ?? '/'),
  });

  const [isModalOpen, setModalOpen] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const canDelete = confirmChecked && normalize(confirmText) === REQUIRED_TOKEN;

  useEffect(() => {
    if (deleteError) toast.error(deleteError.message);
  }, [deleteError]);

  const close = useCallback(() => {
    setModalOpen(false);
    setConfirmChecked(false);
    setConfirmText('');
  }, []);

  // Lock scroll while modal is open
  useEffect(() => {
    if (!isModalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isModalOpen]);

  // ESC to close
  useEffect(() => {
    if (!isModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isModalOpen, close]);

  const baseTrigger =
    'inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition';

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className={`${baseTrigger} ${triggerClassName}`}
      >
        <FaTrashAlt />
        {label}
      </button>

      {isModalOpen && (
        <ModalPortal>
          {/* Backdrop */}
          <div className="fixed inset-0 z-[9999] bg-black/50">
            {/* Layout wrapper (mobile: bottom-sheet style, desktop: centered) */}
            <div
              className="flex min-h-[100dvh] w-full items-end sm:items-center justify-center p-3 sm:p-6"
              onMouseDown={close} // click outside to close
            >
              {/* Dialog */}
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="delete-account-title"
                className="
                  w-full max-w-lg
                  rounded-2xl
                  bg-gray-800 text-white
                  shadow-2xl
                  max-h-[calc(100dvh-1.5rem)]
                  sm:max-h-[calc(100dvh-3rem)]
                  flex flex-col
                  overflow-hidden
                "
                onMouseDown={(e) => e.stopPropagation()} // prevent close when clicking inside
              >
                {/* Header (non-scrolling) */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
                  <h3 id="delete-account-title" className="text-xl sm:text-2xl font-semibold">
                    Delete Account?
                  </h3>
                  <button
                    type="button"
                    onClick={close}
                    className="text-gray-300 hover:text-white transition"
                    aria-label="Close delete dialog"
                  >
                    <FaTimes />
                  </button>
                </div>

                {/* Body (scrolling) */}
                <div className="px-5 py-4 space-y-6 overflow-y-auto">
                  {/* Explanation */}
                  <div className="text-sm leading-relaxed space-y-3">
                    <p>
                      Deleting your account will deactivate your access and remove or anonymize your
                      personal information. Please review what will happen:
                    </p>
                    <ul className="list-disc list-inside space-y-2">
                      <li>
                        <strong>Account deactivation:</strong> You will be signed out and can’t sign
                        in again.
                      </li>
                      <li>
                        <strong>Personal data removal:</strong> Your name, email, phone, avatar, and
                        profile details are erased or replaced with anonymous values.
                      </li>
                      <li>
                        <strong>History retained (anonymized):</strong> Purchases, learning
                        progress, certificates, reviews, and payment records may be kept for audit
                        and fraud prevention, but they will no longer identify you.
                      </li>
                      <li>
                        <strong>Organizations:</strong> Any organizations you own/admin may have
                        ownership transferred to a system account or another admin.
                      </li>
                      <li>
                        <strong>Backups:</strong> Existing backups may contain your data until
                        routine rotation completes (~ {BACKUP_RETENTION_DAYS} days).
                      </li>
                      <li>
                        <strong>Irreversible:</strong> This cannot be undone.
                      </li>
                    </ul>

                    <div className="pt-2">
                      <a
                        href="/settings/export-data"
                        className="text-primary underline hover:opacity-80"
                      >
                        Export a copy of your data (optional)
                      </a>
                    </div>
                  </div>

                  {/* Confirmations */}
                  <div className="space-y-3">
                    <label
                      htmlFor="confirm-delete"
                      className="flex items-start gap-3 text-sm cursor-pointer select-none"
                    >
                      <input
                        id="confirm-delete"
                        type="checkbox"
                        className="
                          h-7 w-7 shrink-0 rounded
                          border border-gray-400
                          bg-white text-red-600
                          focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-800
                        "
                        checked={confirmChecked}
                        onChange={(e) => setConfirmChecked(e.target.checked)}
                      />
                      <span className="leading-6">
                        I understand my personal information will be removed/anonymized and this
                        action cannot be undone.
                      </span>
                    </label>

                    <div>
                      <label className="block text-xs mb-1 text-gray-300">
                        Type <span className="font-mono">{REQUIRED_TOKEN}</span> to confirm
                      </label>
                      <input
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        className="w-full rounded-md bg-gray-700 px-3 py-2 outline-none focus:ring-2 focus:ring-red-500"
                        placeholder={REQUIRED_TOKEN}
                        aria-label={`Type ${REQUIRED_TOKEN} to confirm`}
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck={false}
                        inputMode="text"
                      />
                      {confirmText &&
                        !(confirmChecked && normalize(confirmText) === REQUIRED_TOKEN) && (
                          <p className="mt-1 text-xs text-red-300">
                            Please type {REQUIRED_TOKEN} exactly (case-insensitive, no extra spaces)
                            and tick the checkbox.
                          </p>
                        )}
                    </div>
                  </div>
                </div>

                {/* Footer (always visible) */}
                <div className="px-5 py-4 border-t border-white/10 shrink-0 bg-gray-800">
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={close}
                      className="px-4 py-2 rounded-md bg-gray-700 hover:bg-gray-600 transition disabled:opacity-60"
                      disabled={isDeleting}
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        if (!canDelete) return;
                        await handleDeleteAccount();
                        close();
                      }}
                      className="px-4 py-2 rounded-md bg-red-600 hover:bg-red-700 transition flex items-center gap-2 disabled:opacity-60"
                      disabled={isDeleting || !canDelete}
                    >
                      {isDeleting ? 'Deleting…' : 'Yes, Delete'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
};

export default DeleteAccount;
