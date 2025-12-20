// apps/backend/routes/userRoute.js

import express from 'express';
import authUser from '../middleware/authUser.js';
import {
  loginUser,
  registerUser,
  getUser,
  updateUserRole,
  googleLogin,
  requestPasswordReset,
  adminLogin,
  verifyOTPAndResetPassword,
  deleteUser, // ← import the new handler
} from '../controllers/userController.js';

const userRouter = express.Router();

userRouter.post('/register', registerUser);
userRouter.post('/admin', adminLogin);
userRouter.post('/login', loginUser);
userRouter.post('/google-login', googleLogin);
userRouter.post('/reset-password', requestPasswordReset);
userRouter.post('/verify-otp', verifyOTPAndResetPassword);
userRouter.get('/me', authUser, getUser);
userRouter.put('/update-role', authUser, updateUserRole);

// ← New endpoint to delete both user & profile
userRouter.delete('/account', authUser, deleteUser);

export default userRouter;
