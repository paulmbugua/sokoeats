let ioInstance = null;

export const setSocketServer = (io) => {
  ioInstance = io;
};

export const getSocketServer = () => ioInstance;

export const emitToProfile = (profileId, event, payload) => {
  if (!ioInstance || !profileId) return;
  ioInstance.to(String(profileId)).emit(event, payload);
};
