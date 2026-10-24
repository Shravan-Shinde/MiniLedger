import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const LAN_IP_URL = "http://10.250.154.196:5000/api";
const EMULATOR_URL = "http://10.0.2.2:5000/api";
const LOCALHOST_URL = "http://localhost:5000/api";

const rawEnvUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

function getInitialBaseUrl(): string {
  // If explicitly configured in environment:
  if (rawEnvUrl && rawEnvUrl.length > 0) {
    let clean = rawEnvUrl.replace(/\/+$/, "");
    // Critical safeguard for physical mobile devices / emulators:
    // On Android/iOS runtimes, 'localhost' points to the device itself and will fail to reach the PC.
    // Automatically rewrite localhost or 127.0.0.1 to the developer machine's LAN IP.
    if (Platform.OS !== "web" && (clean.includes("localhost") || clean.includes("127.0.0.1"))) {
      return clean.replace(/localhost|127\.0\.0\.1/g, "10.250.154.196");
    }
    return clean;
  }
  // Default to the computer's reachable LAN IP for physical device development
  return Platform.OS === "web" ? LOCALHOST_URL : LAN_IP_URL;
}

export let API_BASE_URL = getInitialBaseUrl();

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
  totalOutstandingAmount?: number;
  overdueAmount: number;
  totalOverdueAmount?: number;
  activeLoans: number;
  partiallyRepaidLoans?: number;
  repaidLoans: number;
  fullyRepaidLoans?: number;
  overdueLoans?: number;
  totalLoans: number;
};

async function executeFetch(baseUrl: string, path: string, options: RequestInit, token: string | null, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${baseUrl}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

async function request<T>(path: string, options: RequestInit = {}, authenticated = true, timeoutMs = 15000): Promise<T> {
  const token = authenticated ? await AsyncStorage.getItem(TOKEN_KEY) : null;

  // Build candidate URL list (primary configured URL first, followed by resilient fallbacks)
  const candidates = [API_BASE_URL];
  if (!candidates.includes(LAN_IP_URL)) candidates.push(LAN_IP_URL);
  if (Platform.OS === "android" && !candidates.includes(EMULATOR_URL)) candidates.push(EMULATOR_URL);
  if (Platform.OS === "web" && !candidates.includes(LOCALHOST_URL)) candidates.push(LOCALHOST_URL);

  let response: Response | null = null;
  let lastError: Error | null = null;

  for (const candidate of candidates) {
    try {
      response = await executeFetch(candidate, path, options, token, candidate === API_BASE_URL ? timeoutMs : 5000);
      if (candidate !== API_BASE_URL) {
        API_BASE_URL = candidate; // auto-switch to verified reachable endpoint
      }
      break;
    } catch (err: any) {
      lastError = err;
    }
  }

  if (!response) {
    if (lastError?.name === "AbortError") {
      throw new Error(`Connection timed out after ${timeoutMs / 1000}s. Ensure the backend is running and reachable at ${API_BASE_URL}.`);
    }
    throw new Error(`Cannot reach server at ${API_BASE_URL}. Verify your device is on the same Wi-Fi network and port 5000 is open.`);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(payload?.error || "Session expired or invalid. Please log in again.");
    }
    if (response.status === 403) {
      throw new Error(payload?.error || "Access denied.");
    }
    if (response.status === 404) {
      throw new Error(payload?.error || "Requested resource not found.");
    }
    if (response.status >= 500) {
      throw new Error(payload?.error || "Server error. Please try again later.");
    }
    const message = payload?.error || payload?.message || `Request failed (${response.status})`;
    throw new Error(message);
  }
  return payload as T;
}

export const api = {
  getHealth: () => request<{ status: string; service: string }>("/health", { method: "GET" }, false),
  requestOtp: (phone: string) =>
    request<{ message: string }>("/auth/request-otp", { method: "POST", body: JSON.stringify({ phone }) }, false),
  verifyOtp: (phone: string, otp: string) =>
    request<{ token: string; user: { id: string; phone: string }; message: string }>(
      "/auth/verify-otp", { method: "POST", body: JSON.stringify({ phone, otp }) }, false
    ),
  getLoans: () => request<{ loans: Loan[] }>("/loans"),
  getLoan: (id: string) => request<{ loan: Loan }>(`/loans/${encodeURIComponent(id)}`),
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
