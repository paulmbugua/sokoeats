// packages/shared/hooks/useUploadClassVault.ts
import { useMemo } from 'react';
import { useShopContext } from '@myhandymanapp/shared/context';
import useAppQuery from './useAppQuery';
import { useMutation, useQueryClient, QueryKey, MutationFunction } from '@tanstack/react-query';
import { fetchUserRole } from '@myhandymanapp/shared/api/profileApi';
import { uploadClassVaultAsset } from '@myhandymanapp/shared/api/classVaultUploadApi';
import { createVideoJson } from '@myhandymanapp/shared/api/classVaultApi';
import type { RecordedVideo } from '@myhandymanapp/shared/types';

// Pick the fields needed to create a new RecordedVideo
export type CreateRecordedVideoPayload = Pick<
  RecordedVideo,
  'title' | 'subject' | 'grade_level' | 'price' | 'duration' | 'tags' | 'video_url' | 'pdf_url'
>;

export interface UploadResult {
  url: string;
}

// Build a QueryKey from any segments
function makeKey(...segments: (string | number)[]): QueryKey {
  return segments;
}

export default function useUploadClassVault() {
  const { token, backendUrl } = useShopContext();
  const queryClient = useQueryClient();

  // 1️⃣ Fetch user role
  const {
    data: role = '',
    isLoading: loadingRole,
    error: roleError,
  } = useAppQuery<string, Error, string>(
    makeKey('userRole', token),
    () => fetchUserRole(backendUrl!, token!),
    { enabled: Boolean(token && backendUrl) }
  );

  const ensureTutor = () => {
    if (role !== 'tutor') {
      throw new Error('Only tutors may upload ClassVault content.');
    }
  };

  // 2️⃣ Upload asset mutation
  const uploadFn: MutationFunction<
    UploadResult,
    {
      fileType: 'video' | 'pdf';
      file: { uri: string; name: string; type: string };
      onProgress?: (percent: number) => void;
    }
  > = async ({ fileType, file, onProgress }) => {
    ensureTutor();
    return uploadClassVaultAsset(backendUrl!, token!, file, fileType, onProgress);
  };

  const uploadMutation = useMutation<UploadResult, Error, Parameters<typeof uploadFn>[0], unknown>({
    mutationFn: uploadFn,
  });

  // 3️⃣ Submit metadata mutation
  const metaFn: MutationFunction<void, CreateRecordedVideoPayload> = async (metadata) => {
    ensureTutor();
    await createVideoJson(backendUrl!, token!, metadata);
  };

  const metadataMutation = useMutation<void, Error, CreateRecordedVideoPayload, unknown>({
    mutationFn: metaFn,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: makeKey('classVaultVideos'),
      });
    },
  });

  // 4️⃣ Combined loading flag (React Query v5 uses "pending")
  const uploading = useMemo(
    () => uploadMutation.status === 'pending' || metadataMutation.status === 'pending',
    [uploadMutation.status, metadataMutation.status]
  );

  return {
    role,
    loadingRole,
    roleError,
    uploading,
    handleFileUpload: uploadMutation.mutateAsync,
    handleSubmitMetadata: metadataMutation.mutateAsync,
  };
}
