import AsyncStorage from "@react-native-async-storage/async-storage";

const API_BASE = process.env.EXPO_PUBLIC_API_URL || "http://localhost:5000/api";
const TOKEN_KEY = "miniledger_access_token";

export type Repayment = { id: string; amount: number; repaidAt: string };
export type Loan = {
  id: string;
  friendName: string;
  amount: number;
  repaidAmount: number;
  outstandingAmount: number;
  dueDate: string;
  createdAt: string;
  status: "PENDING" | "OVERDUE" | "REPAID";
  isOverdue: boolean;
  repayments: Repayment[];
};
export type Summary = {
  totalLent: number;
  totalRepaid: number;
  outstandingAmount: number;
  overdueAmount: number;
  activeLoans: number;
  repaidLoans: number;
  totalLoans: number;
};

async function request<T>(path: string, options: RequestInit = {}, authenticated = true): Promise<T> {
  const token = authenticated ? await AsyncStorage.getItem(TOKEN_KEY) : null;
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error || payload?.message || `Request failed (${response.status})`;
    throw new Error(message);
  }
  return payload as T;
}

export const api = {
  requestOtp: (phone: string) =>
    request<{ message: string }>("/auth/request-otp", { method: "POST", body: JSON.stringify({ phone }) }, false),
  verifyOtp: (phone: string, otp: string) =>
    request<{ token: string; user: { id: string; phone: string }; message: string }>(
      "/auth/verify-otp", { method: "POST", body: JSON.stringify({ phone, otp }) }, false
    ),
  getLoans: () => request<{ loans: Loan[] }>("/loans"),
  createLoan: (input: { friendName: string; amount: number; dueDate: string }) =>
    request<{ loan: Loan; message: string }>("/loans", { method: "POST", body: JSON.stringify(input) }),
  repayLoan: (id: string) =>
    request<{ loan: Loan; message: string }>(`/loans/${encodeURIComponent(id)}/repay`, { method: "PATCH" }),
  recordRepayment: (id: string, amount: number) =>
    request<{ loan: Loan; message: string }>(`/loans/${encodeURIComponent(id)}/repayments`, {
      method: "POST", body: JSON.stringify({ amount })
    }),
  getSummary: () => request<Summary>("/summary")
};

export { TOKEN_KEY };
