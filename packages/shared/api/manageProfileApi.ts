// /packages/shared/api/manageProfileApi.ts
import axios from 'axios';

export const fetchMyProfile = async (backendUrl: string, token: string) => {
  const response = await axios.get(`${backendUrl}/api/profile/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

export const fetchAvailableProfiles = async (backendUrl: string, token: string) => {
  const response = await axios.get(`${backendUrl}/api/profile`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

export const updateProfile = async (backendUrl: string, token: string, body: any) => {
  const response = await axios.put(`${backendUrl}/api/profile`, body, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  return response;
};

export const deleteGalleryImage = async (
  backendUrl: string,
  token: string,
  profileId: string,
  imageUrl: string
) => {
  const response = await axios.delete(`${backendUrl}/api/profile/${profileId}/remove/gallery`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { item: imageUrl },
  });
  return response;
};

export const deleteVideo = async (
  backendUrl: string,
  token: string,
  profileId: string,
  video: string
) => {
  const response = await axios.delete(`${backendUrl}/api/profile/${profileId}/remove/video`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { item: video },
  });
  return response;
};
