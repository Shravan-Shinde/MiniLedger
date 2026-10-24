import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, API_BASE_URL, Loan, Summary, TOKEN_KEY } from "./src/api";

const money = (amount: number) => `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const todayString = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const dateWithOffset = (days: number) => {
  const now = new Date();
  now.setDate(now.getDate() + days);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

function Button({
  title,
  onPress,
  disabled,
  secondary,
  danger
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.buttonSecondary,
        danger && styles.buttonDanger,
        disabled && styles.buttonDisabled,
        pressed && !disabled && { opacity: 0.8 }
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          secondary && styles.buttonSecondaryText,
          danger && styles.buttonDangerText
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType, autoCapitalize = "sentences" }: any) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9AA3B2"
        keyboardType={keyboardType || "default"}
        autoCapitalize={autoCapitalize}
        style={styles.input}
      />
    </View>
  );
}

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpRequested, setOtpRequested] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [screen, setScreen] = useState<"auth" | "dashboard" | "add">("auth");
  const [loans, setLoans] = useState<Loan[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [friendName, setFriendName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(todayString());
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // Partial repayment modal state
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [repaymentAmount, setRepaymentAmount] = useState("");
  const [repayModalVisible, setRepayModalVisible] = useState(false);

  // Timer for OTP resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  // Android hardware back button navigation
  useEffect(() => {
    const onBackPress = () => {
      if (repayModalVisible) {
        setRepayModalVisible(false);
        setSelectedLoan(null);
        setError("");
        return true;
      }
      if (screen === "add") {
        setScreen("dashboard");
        setError("");
        return true;
      }
      if (screen === "auth" && otpRequested) {
        setOtpRequested(false);
        setOtp("");
        setError("");
        return true;
      }
      return false;
    };

    const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => subscription.remove();
  }, [repayModalVisible, screen, otpRequested]);

  const loadDashboard = useCallback(async () => {
    const [loanResult, summaryResult] = await Promise.all([api.getLoans(), api.getSummary()]);
    setLoans(loanResult.loans);
    setSummary(summaryResult);
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(TOKEN_KEY).then((saved) => {
      if (saved) {
        setToken(saved);
        setScreen("dashboard");
        loadDashboard().catch(() => {
          AsyncStorage.removeItem(TOKEN_KEY);
          setToken(null);
          setScreen("auth");
        });
      }
    });
  }, [loadDashboard]);

  const runAction = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const handleRequestOtp = (isResend = false) =>
    runAction(async () => {
      const normalized = phone.trim().replace(/[\s()-]/g, "");
      if (!/^\+?[1-9]\d{7,14}$/.test(normalized)) {
        throw new Error("Enter a valid phone number (e.g. +91 9876543210).");
      }
      await api.requestOtp(normalized);
      setPhone(normalized);
      setOtpRequested(true);
      setResendCooldown(30);
      Alert.alert(
        isResend ? "New OTP Requested" : "OTP Requested",
        "Check the backend server terminal for the 6-digit mock OTP."
      );
    });

  const handleVerifyOtp = () =>
    runAction(async () => {
      if (!/^\d{6}$/.test(otp)) {
        throw new Error("Enter the 6-digit OTP from the backend terminal.");
      }
      const result = await api.verifyOtp(phone.trim(), otp);
      await AsyncStorage.setItem(TOKEN_KEY, result.token);
      setToken(result.token);
      setScreen("dashboard");
      setOtpRequested(false);
      setOtp("");
      await loadDashboard();
    });

  const handleCreateLoan = () =>
    runAction(async () => {
      const parsedAmount = Number(amount);
      if (!friendName.trim()) throw new Error("Enter your friend's name.");
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        throw new Error("Amount must be greater than zero.");
      }
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) ||
        Number.isNaN(new Date(`${dueDate}T00:00:00Z`).getTime()) ||
        new Date(`${dueDate}T00:00:00Z`).toISOString().slice(0, 10) !== dueDate
      ) {
        throw new Error("Enter a valid calendar date in YYYY-MM-DD format.");
      }
      await api.createLoan({ friendName: friendName.trim(), amount: parsedAmount, dueDate });
      setFriendName("");
      setAmount("");
      setDueDate(todayString());
      await loadDashboard();
      setScreen("dashboard");
    });

  const openRepayModal = (loan: Loan) => {
    setSelectedLoan(loan);
    setRepaymentAmount(String(loan.outstandingAmount));
    setRepayModalVisible(true);
    setError("");
  };

  const handleFullRepayment = () => {
    if (!selectedLoan) return;
    Alert.alert(
      "Confirm Repayment",
      `Mark entire remaining balance of ${money(selectedLoan.outstandingAmount)} as repaid by ${selectedLoan.friendName}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: () =>
            runAction(async () => {
              await api.repayLoan(selectedLoan.id);
              setRepayModalVisible(false);
              setSelectedLoan(null);
              await loadDashboard();
            })
        }
      ]
    );
  };

  const handleCustomRepayment = () => {
    if (!selectedLoan) return;
    const parsed = Number(repaymentAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Please enter a valid repayment amount greater than 0.");
      return;
    }
    if (parsed > selectedLoan.outstandingAmount) {
      setError(`Repayment cannot exceed outstanding balance of ${money(selectedLoan.outstandingAmount)}.`);
      return;
    }

    runAction(async () => {
      await api.recordRepayment(selectedLoan.id, parsed);
      setRepayModalVisible(false);
      setSelectedLoan(null);
      await loadDashboard();
    });
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setScreen("auth");
    setPhone("");
    setOtp("");
    setOtpRequested(false);
    setLoans([]);
    setSummary(null);
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await loadDashboard();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not refresh.");
    } finally {
      setRefreshing(false);
    }
  };

  const sortedLoans = useMemo(() => loans, [loans]);

  if (!token || screen === "auth") {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" backgroundColor="#F5F7FB" />
        <KeyboardAvoidingView style={styles.authContainer} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>M</Text>
          </View>
          <Text style={styles.brand}>MiniLedger</Text>
          <Text style={styles.tagline}>Money Lending Tracker · Friends & Family</Text>

          <View style={styles.panel}>
            <Text style={styles.heading}>{otpRequested ? "Verify OTP" : "Welcome back"}</Text>
            <Text style={styles.muted}>
              {otpRequested
                ? `Enter the 6-digit code logged in the backend server terminal for ${phone}.`
                : "Keep track of money lent to friends with full transparency."}
            </Text>

            {!otpRequested ? (
              <>
                <Field
                  label="Phone number"
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="+91 9876543210"
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                />
                <Button title={busy ? "Sending..." : "Send Mock OTP"} onPress={() => handleRequestOtp(false)} disabled={busy} />
              </>
            ) : (
              <>
                <Field
                  label="6-digit OTP"
                  value={otp}
                  onChangeText={(v: string) => setOtp(v.replace(/\D/g, "").slice(0, 6))}
                  placeholder="e.g. 123456"
                  keyboardType="number-pad"
                  autoCapitalize="none"
                />
                <Button title={busy ? "Verifying..." : "Verify and Continue"} onPress={handleVerifyOtp} disabled={busy || otp.length < 6} />

                <View style={styles.otpActionRow}>
                  <Pressable
                    onPress={() => handleRequestOtp(true)}
                    disabled={resendCooldown > 0 || busy}
                    style={styles.resendBtn}
                  >
                    <Text style={[styles.resendText, resendCooldown > 0 && styles.resendTextDisabled]}>
                      {resendCooldown > 0 ? `Resend OTP in ${resendCooldown}s` : "↻ Resend OTP"}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      setOtpRequested(false);
                      setOtp("");
                      setError("");
                    }}
                    style={styles.changePhoneBtn}
                  >
                    <Text style={styles.changePhoneText}>Change phone</Text>
                  </Pressable>
                </View>
              </>
            )}

            {busy && <ActivityIndicator style={{ marginTop: 14 }} color="#4F46E5" />}
            {!!error && <Text style={styles.errorText}>{error}</Text>}
          </View>

          <Text style={styles.footnote}>Connected to: {API_BASE_URL} · Check terminal for OTP</Text>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  if (screen === "add") {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" backgroundColor="#F5F7FB" />
        <ScrollView contentContainerStyle={styles.page}>
          <Pressable onPress={() => setScreen("dashboard")}>
            <Text style={styles.backLink}>‹ Back to dashboard</Text>
          </Pressable>
          <Text style={styles.pageTitle}>Add a Loan</Text>
          <Text style={styles.muted}>Record money you lent to a friend.</Text>

          <View style={styles.panel}>
            <Field label="Friend's Name" value={friendName} onChangeText={setFriendName} placeholder="e.g. Rahul" />
            <Field
              label="Amount (₹)"
              value={amount}
              onChangeText={setAmount}
              placeholder="e.g. 2500"
              keyboardType="decimal-pad"
              autoCapitalize="none"
            />
            <Field
              label="Due Date (YYYY-MM-DD)"
              value={dueDate}
              onChangeText={setDueDate}
              placeholder="2026-10-30"
              autoCapitalize="none"
            />

            <Text style={styles.helper}>Quick preset:</Text>
            <View style={styles.chipsRow}>
              <Pressable style={styles.chip} onPress={() => setDueDate(todayString())}>
                <Text style={styles.chipText}>Today</Text>
              </Pressable>
              <Pressable style={styles.chip} onPress={() => setDueDate(dateWithOffset(7))}>
                <Text style={styles.chipText}>+7 Days</Text>
              </Pressable>
              <Pressable style={styles.chip} onPress={() => setDueDate(dateWithOffset(15))}>
                <Text style={styles.chipText}>+15 Days</Text>
              </Pressable>
              <Pressable style={styles.chip} onPress={() => setDueDate(dateWithOffset(30))}>
                <Text style={styles.chipText}>+30 Days</Text>
              </Pressable>
            </View>

            <Button title={busy ? "Saving..." : "Save Loan"} onPress={handleCreateLoan} disabled={busy} />
            <Button title="Cancel" onPress={() => setScreen("dashboard")} secondary />
            {!!error && <Text style={styles.errorText}>{error}</Text>}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F7FB" />
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#4F46E5" />}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.brandSmall}>MiniLedger</Text>
            <Text style={styles.muted}>A clearer view of what you're owed.</Text>
          </View>
          <Pressable onPress={handleLogout} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Log out</Text>
          </Pressable>
        </View>

        {/* Hero Card */}
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>Total Outstanding</Text>
          <Text style={styles.heroAmount}>{money(summary?.outstandingAmount || 0)}</Text>
          <Text style={styles.heroFoot}>
            {summary?.activeLoans || 0} active loan{summary?.activeLoans === 1 ? "" : "s"}
          </Text>
        </View>

        {/* Summary Grid */}
        <View style={styles.summaryGrid}>
          <SummaryCard title="Total Lent" amount={summary?.totalLent || 0} tone="purple" />
          <SummaryCard title="Total Repaid" amount={summary?.totalRepaid || 0} tone="green" />
          <SummaryCard title="Overdue" amount={summary?.overdueAmount || 0} tone="red" />
          <SummaryCard title="Fully Repaid" amount={summary?.repaidLoans || 0} isCount tone="blue" />
        </View>

        {/* Loan Section Header */}
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Your Loans</Text>
            <Text style={styles.muted}>
              {loans.length} record{loans.length === 1 ? "" : "s"}
            </Text>
          </View>
          <Pressable
            style={styles.addButton}
            onPress={() => {
              setError("");
              setScreen("add");
            }}
          >
            <Text style={styles.addButtonText}>＋ Add Loan</Text>
          </Pressable>
        </View>

        {!!error && <Text style={styles.errorText}>{error}</Text>}
        {busy && <ActivityIndicator color="#4F46E5" style={{ marginVertical: 12 }} />}

        {sortedLoans.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>↗</Text>
            <Text style={styles.emptyTitle}>Nothing to track yet</Text>
            <Text style={styles.muted}>Add your first loan to see your money summary here.</Text>
            <Button title="Add your first loan" onPress={() => setScreen("add")} />
          </View>
        ) : (
          sortedLoans.map((loan) => <LoanCard key={loan.id} loan={loan} onRepay={() => openRepayModal(loan)} />)
        )}

        <Text style={styles.footer}>Pull down to refresh · Accurate server calculations</Text>
      </ScrollView>

      {/* Repayment Modal */}
      <Modal visible={repayModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Record Repayment</Text>
            <Text style={styles.muted}>
              {selectedLoan ? `Borrower: ${selectedLoan.friendName}` : ""}
            </Text>
            {selectedLoan && (
              <View style={styles.modalBalanceBox}>
                <Text style={styles.modalBalanceLabel}>Outstanding Balance:</Text>
                <Text style={styles.modalBalanceVal}>{money(selectedLoan.outstandingAmount)}</Text>
              </View>
            )}

            <Field
              label="Repayment Amount (₹)"
              value={repaymentAmount}
              onChangeText={setRepaymentAmount}
              placeholder="Enter amount"
              keyboardType="decimal-pad"
            />

            {!!error && <Text style={styles.errorText}>{error}</Text>}

            <Button
              title={busy ? "Recording..." : `Repay ${money(Number(repaymentAmount) || 0)}`}
              onPress={handleCustomRepayment}
              disabled={busy}
            />

            <Button
              title="Mark Entire Balance as Repaid"
              onPress={handleFullRepayment}
              disabled={busy}
              secondary
            />

            <Button
              title="Cancel"
              onPress={() => {
                setRepayModalVisible(false);
                setSelectedLoan(null);
                setError("");
              }}
              secondary
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function SummaryCard({
  title,
  amount,
  tone,
  isCount
}: {
  title: string;
  amount: number;
  tone: string;
  isCount?: boolean;
}) {
  return (
    <View style={[styles.summaryCard, styles[`tone_${tone}` as keyof typeof styles] as any]}>
      <Text style={styles.summaryLabel}>{title}</Text>
      <Text style={styles.summaryAmount}>{isCount ? amount : money(amount)}</Text>
    </View>
  );
}

function LoanCard({ loan, onRepay }: { loan: Loan; onRepay: () => void }) {
  const statusStyle =
    loan.status === "OVERDUE"
      ? styles.statusOverdue
      : loan.status === "REPAID"
      ? styles.statusRepaid
      : styles.statusPending;

  return (
    <View style={[styles.loanCard, loan.isOverdue && styles.loanCardOverdue]}>
      <View style={styles.loanTop}>
        <View style={[styles.avatar, loan.isOverdue && styles.avatarOverdue]}>
          <Text style={[styles.avatarText, loan.isOverdue && styles.avatarTextOverdue]}>
            {loan.friendName.slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.friendName}>{loan.friendName}</Text>
          <Text style={[styles.loanDue, loan.isOverdue && styles.loanDueOverdue]}>
            Due {loan.dueDate} {loan.isOverdue ? "· Overdue" : ""}
          </Text>
        </View>
        <View style={[styles.statusPill, statusStyle]}>
          <Text style={[styles.statusText, loan.isOverdue && styles.statusTextOverdue]}>{loan.status}</Text>
        </View>
      </View>

      <View style={styles.loanAmounts}>
        <AmountItem label="Original Lent" amount={money(loan.amount)} />
        <AmountItem label="Repaid" amount={money(loan.repaidAmount)} />
        <AmountItem
          label="Remaining"
          amount={money(loan.outstandingAmount)}
          highlight={loan.isOverdue && loan.outstandingAmount > 0}
        />
      </View>

      {loan.status !== "REPAID" && (
        <Pressable onPress={onRepay} style={[styles.repayButton, loan.isOverdue && styles.repayButtonOverdue]}>
          <Text style={[styles.repayButtonText, loan.isOverdue && styles.repayButtonTextOverdue]}>
            ✓ Record Repayment / Clear Balance
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function AmountItem({ label, amount, highlight }: { label: string; amount: string; highlight?: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.amountLabel}>{label}</Text>
      <Text style={[styles.amountValue, highlight && styles.amountValueHighlight]}>{amount}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F5F7FB" },
  authContainer: { flex: 1, justifyContent: "center", padding: 24 },
  brandMark: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: "#4F46E5",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 12
  },
  brandMarkText: { color: "#FFFFFF", fontSize: 30, fontWeight: "800" },
  brand: { fontSize: 30, fontWeight: "800", color: "#171A2B", textAlign: "center", letterSpacing: -0.8 },
  tagline: { color: "#778096", textAlign: "center", marginTop: 5, marginBottom: 28, fontSize: 14 },
  panel: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E8EBF3",
    shadowColor: "#1B2450",
    shadowOpacity: 0.04,
    shadowRadius: 18,
    elevation: 2
  },
  heading: { fontSize: 22, fontWeight: "800", color: "#171A2B", marginBottom: 7 },
  muted: { color: "#7C8498", fontSize: 13, lineHeight: 19 },
  fieldWrap: { marginTop: 16 },
  label: { color: "#3A4156", fontWeight: "700", fontSize: 13, marginBottom: 8 },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: "#E1E5EF",
    borderRadius: 12,
    paddingHorizontal: 14,
    color: "#171A2B",
    backgroundColor: "#FCFCFE",
    fontSize: 15
  },
  button: {
    minHeight: 48,
    backgroundColor: "#4F46E5",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
    paddingHorizontal: 14
  },
  buttonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  buttonSecondary: { backgroundColor: "#F0F1F8", borderWidth: 1, borderColor: "#E1E4F0" },
  buttonSecondaryText: { color: "#3A4156" },
  buttonDanger: { backgroundColor: "#EF4444" },
  buttonDangerText: { color: "#FFFFFF" },
  buttonDisabled: { opacity: 0.55 },
  errorText: { color: "#C03948", fontSize: 13, marginTop: 12, lineHeight: 18, fontWeight: "600" },
  footnote: { textAlign: "center", color: "#9299AA", fontSize: 11, marginTop: 18 },
  otpActionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 14 },
  resendBtn: { paddingVertical: 6 },
  resendText: { color: "#4F46E5", fontSize: 13, fontWeight: "700" },
  resendTextDisabled: { color: "#9AA3B2" },
  changePhoneBtn: { paddingVertical: 6 },
  changePhoneText: { color: "#64748B", fontSize: 13 },
  page: { padding: 20, paddingBottom: 36 },
  backLink: { color: "#4F46E5", fontWeight: "700", marginBottom: 18, fontSize: 14 },
  pageTitle: { fontSize: 28, fontWeight: "800", color: "#171A2B", letterSpacing: -0.7 },
  helper: { fontSize: 12, color: "#8991A4", marginTop: 14, marginBottom: 6, fontWeight: "600" },
  chipsRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  chip: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0"
  },
  chipText: { fontSize: 12, color: "#475569", fontWeight: "600" },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  brandSmall: { fontSize: 24, fontWeight: "800", color: "#171A2B", letterSpacing: -0.7 },
  logoutButton: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 10, backgroundColor: "#ECEEFA" },
  logoutText: { color: "#4F46E5", fontWeight: "700", fontSize: 12 },
  hero: { backgroundColor: "#27245F", borderRadius: 22, padding: 22, marginBottom: 14 },
  heroLabel: { color: "#C7C6F4", fontSize: 13, fontWeight: "600" },
  heroAmount: { color: "#FFFFFF", fontSize: 34, fontWeight: "800", marginTop: 8, letterSpacing: -1 },
  heroFoot: { color: "#D7D6FA", marginTop: 8, fontSize: 12 },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 26 },
  summaryCard: { width: "48%", minHeight: 94, borderRadius: 16, padding: 14, borderWidth: 1, justifyContent: "center" },
  tone_purple: { backgroundColor: "#F0EEFF", borderColor: "#E4DFFF" },
  tone_green: { backgroundColor: "#EAF8F1", borderColor: "#D5F0E3" },
  tone_red: { backgroundColor: "#FFF0F0", borderColor: "#FBE0E0" },
  tone_blue: { backgroundColor: "#EAF4FF", borderColor: "#DCEBFC" },
  summaryLabel: { color: "#737B90", fontSize: 12, fontWeight: "600" },
  summaryAmount: { color: "#20243A", fontSize: 19, fontWeight: "800", marginTop: 7 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  sectionTitle: { fontSize: 21, color: "#171A2B", fontWeight: "800", letterSpacing: -0.4 },
  addButton: { backgroundColor: "#4F46E5", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 11 },
  addButtonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 12 },
  emptyState: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E8EBF3"
  },
  emptyIcon: { fontSize: 30, color: "#4F46E5", marginBottom: 8 },
  emptyTitle: { color: "#22263A", fontWeight: "800", fontSize: 17, marginBottom: 5 },
  loanCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E7EAF2",
    borderRadius: 18,
    padding: 16,
    marginBottom: 12
  },
  loanCardOverdue: {
    borderColor: "#EF4444",
    backgroundColor: "#FEF2F2",
    borderWidth: 1.5
  },
  loanTop: { flexDirection: "row", alignItems: "center", gap: 11 },
  avatar: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#EEEAFE", alignItems: "center", justifyContent: "center" },
  avatarOverdue: { backgroundColor: "#FEE2E2" },
  avatarText: { color: "#4F46E5", fontSize: 17, fontWeight: "800" },
  avatarTextOverdue: { color: "#DC2626" },
  friendName: { fontSize: 16, fontWeight: "800", color: "#20243A" },
  loanDue: { color: "#858DA0", fontSize: 12, marginTop: 3 },
  loanDueOverdue: { color: "#DC2626", fontWeight: "700" },
  statusPill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  statusOverdue: { backgroundColor: "#FEE2E2" },
  statusRepaid: { backgroundColor: "#DDF6E8" },
  statusPending: { backgroundColor: "#FFF0D8" },
  statusText: { fontSize: 10, fontWeight: "900", color: "#464B5C" },
  statusTextOverdue: { color: "#DC2626" },
  loanAmounts: {
    flexDirection: "row",
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#F0F1F6",
    gap: 5
  },
  amountLabel: { color: "#9299AA", fontSize: 10, marginBottom: 4 },
  amountValue: { color: "#30354B", fontSize: 13, fontWeight: "800" },
  amountValueHighlight: { color: "#DC2626", fontWeight: "900" },
  repayButton: {
    marginTop: 14,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: "#F0EEFF"
  },
  repayButtonOverdue: { backgroundColor: "#FEE2E2" },
  repayButtonText: { color: "#4F46E5", fontSize: 12, fontWeight: "800" },
  repayButtonTextOverdue: { color: "#DC2626" },
  footer: { textAlign: "center", color: "#9AA1B0", fontSize: 11, marginTop: 10, marginBottom: 10 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "flex-end"
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40
  },
  modalTitle: { fontSize: 20, fontWeight: "800", color: "#0F172A", marginBottom: 4 },
  modalBalanceBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    padding: 12,
    borderRadius: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0"
  },
  modalBalanceLabel: { color: "#64748B", fontSize: 13, fontWeight: "600" },
  modalBalanceVal: { color: "#0F172A", fontSize: 16, fontWeight: "800" }
});
