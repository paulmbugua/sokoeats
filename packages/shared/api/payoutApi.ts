import axios from 'axios';
import type { WithdrawalRequestBody, WithdrawalResponse } from '@myhandymanapp/shared/types';

export const requestWithdrawal = async (
  backendUrl: string,
  token: string,
  body: WithdrawalRequestBody
): Promise<WithdrawalResponse> => {
  const url = `${backendUrl}/api/payouts/withdraw`;
  const res = await axios.post<WithdrawalResponse>(url, body, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  return res.data;
};
