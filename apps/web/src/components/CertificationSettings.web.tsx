// apps/web/src/components/CertificationSettings.web.tsx

import React, { useState } from 'react';
import { useShopContext } from '@mytutorapp/shared/context';
import Spinner from './Spinner.web';
import useCertificationSettings, {
  Base64File,
} from '@mytutorapp/shared/hooks/useCertificationSettings';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

export default function CertificationSettings() {
  const { token, backendUrl, profile } = useShopContext();
  const { uploading, certificationData, handleSubmit } = useCertificationSettings(
    backendUrl,
    token,
    profile?.id
  );

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  // Helper: check if current user is a tutor
  const isTutor = profile?.role?.toLowerCase() === 'tutor';

  // Convert File → base64 string
  const toBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        resolve(dataUrl.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  // Handle <input type="file" />
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    const valid = files.filter((file) => {
      if (file.size > MAX_FILE_SIZE) {
        alert(`"${file.name}" exceeds 5MB.`);
        return false;
      }
      if (!ALLOWED_TYPES.includes(file.type)) {
        alert(`"${file.name}" must be PDF, JPEG, or PNG.`);
        return false;
      }
      return true;
    });
    setSelectedFiles(valid);
  };

  // Form submission
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isTutor) return;
    if (selectedFiles.length === 0) {
      alert('Please select at least one file.');
      return;
    }
    try {
      const base64Files: Base64File[] = await Promise.all(
        selectedFiles.map((file) =>
          toBase64(file).then((b) => ({
            name: file.name,
            type: file.type,
            base64: b,
          }))
        )
      );
      await handleSubmit(base64Files);
    } catch (err: any) {
      console.error('Upload failed:', err);
      alert(err.message || 'Upload error');
    }
  };

  // Only tutors can see the upload form
  if (!isTutor) {
    return (
      <div className="w-full max-w-3xl mx-auto bg-gray-900 p-6 rounded-lg shadow-md">
        <h2 className="text-3xl font-bold text-pink-400 mb-4">Tutor Certification</h2>
        <p className="text-gray-400 text-sm">Certification upload is available only for tutors.</p>
      </div>
    );
  }

  // Show spinner while uploading
  if (uploading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto bg-gray-900 p-6 rounded-lg shadow-md">
      <h2 className="text-3xl font-bold text-pink-400 mb-4">Tutor Certification</h2>
      <p className="text-gray-400 mb-6 text-sm">
        (Optional) Enhance your profile’s credibility by submitting your qualification documents.
        You can upload multiple files (each max 5MB, PDF/JPEG/PNG).
      </p>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="certFiles" className="block text-gray-300 mb-2">
            Certification Documents
          </label>
          <input
            id="certFiles"
            type="file"
            multiple
            accept=".pdf,image/jpeg,image/png"
            onChange={onFileChange}
            className="w-full p-2 rounded-md bg-gray-800 border border-gray-700 text-gray-200 focus:outline-none focus:ring-2 focus:ring-pink-500"
          />
          {selectedFiles.length > 0 && (
            <ul className="mt-2 text-gray-200 text-sm">
              {selectedFiles.map((f) => (
                <li key={f.name}>{f.name}</li>
              ))}
            </ul>
          )}
        </div>

        {!certificationData || certificationData.status === 'Pending' ? (
          <button
            type="submit"
            className="w-full py-2 px-4 bg-pink-500 hover:bg-pink-600 text-white font-medium rounded-md shadow transition duration-300"
          >
            {certificationData ? 'Update Certification' : 'Submit Certification'}
          </button>
        ) : (
          <div className="mt-6 p-4 bg-green-600 rounded-md">
            <p className="text-white text-sm">
              Certification status: <span className="font-bold">{certificationData.status}</span>
            </p>
          </div>
        )}
      </form>
    </div>
  );
}
