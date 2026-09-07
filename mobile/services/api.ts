/**
 * Bidii API Client
 *
 * Wraps all HTTP calls to the bidii backend, adding auth headers,
 * server-time extraction, and structured error handling.
 */

import { API_BASE_URL, SCHOOL_ID } from '@/constants';
import { fineEngine } from './fineEngine';
import * as SecureStore from 'expo-secure-store';

// Legacy AsyncStorage key — kept only for the one-time migration in auth.ts.
// The api client itself now reads/writes from SecureStore exclusively.
const AUTH_TOKEN_KEY = '@bidii:auth_token';

class ApiClient {
  private token: string | null = null;

  /** Load stored token on startup */
  async init(): Promise<void> {
    this.token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
  }

  /** Save auth token after login */
  async setToken(token: string): Promise<void> {
    this.token = token;
    await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
  }

  /** Clear token on logout */
  async clearToken(): Promise<void> {
    this.token = null;
    await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
  }

  /** Build headers for every request */
  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-School-ID': SCHOOL_ID,
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      ...extra,
    };
  }

  /** Generic request wrapper with error handling */
  async request<T = any>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: any
  ): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: this.headers(),
      body: body ? JSON.stringify(body) : undefined,
    });

    // Extract and cache server time from every response
    const serverDate = response.headers.get('Date') || response.headers.get('X-Server-Time');
    if (serverDate) {
      await fineEngine.updateServerTimeFromResponse(serverDate);
    }

    const data = await response.json();

    if (!response.ok) {
      throw new ApiError(
        data.error || data.message || `HTTP ${response.status}`,
        response.status,
        data
      );
    }

    return data as T;
  }

  get<T>(path: string) { return this.request<T>('GET', path); }
  post<T>(path: string, body?: any) { return this.request<T>('POST', path, body); }
  patch<T>(path: string, body?: any) { return this.request<T>('PATCH', path, body); }
  delete<T>(path: string) { return this.request<T>('DELETE', path); }

  // ── Auth ──────────────────────────────────────────────────────────────────

  login(email: string, password: string) {
    return this.post<{ token: string; user: AuthUser }>('/api/auth/login', { email, password });
  }

  // ── Students ──────────────────────────────────────────────────────────────

  searchStudents(q: string) {
    return this.get<StudentHit[]>(`/api/library/students/search?q=${encodeURIComponent(q)}`);
  }

  getStudentPhoto(fileId: string): string {
    return `${API_BASE_URL}/api/students/files/${fileId}`;
  }

  // ── Library Cards ─────────────────────────────────────────────────────────

  getCard(studentId: string) {
    return this.get<CardDetail>(`/api/library/cards/${studentId}`);
  }

  // ── Catalogues ────────────────────────────────────────────────────────────

  getCatalogues(params?: { q?: string; form?: number; subject?: string; page?: number }) {
    const search = new URLSearchParams();
    if (params?.q) search.set('q', params.q);
    if (params?.form) search.set('form', params.form.toString());
    if (params?.subject) search.set('subject', params.subject);
    if (params?.page) search.set('page', params.page.toString());
    return this.get<CatalogueListResult>(`/api/library/catalogue?${search}`);
  }

  createCatalogue(data: CreateCatalogueInput) {
    return this.post<CatalogueRecord>('/api/library/catalogue', data);
  }

  updateCatalogue(id: string, data: Partial<CreateCatalogueInput>) {
    return this.patch<CatalogueRecord>(`/api/library/catalogue/${id}`, data);
  }

  getCatalogueWithCopies(id: string) {
    return this.get<CatalogueWithCopies>(`/api/library/catalogue/${id}`);
  }

  // ── Copies ────────────────────────────────────────────────────────────────

  searchCopies(q: string) {
    return this.get<CopyRecord[]>(`/api/library/copies?q=${encodeURIComponent(q)}`);
  }

  createCopy(data: CreateCopyInput) {
    return this.post<CopyRecord>('/api/library/copies', data);
  }

  updateCopy(id: string, data: Partial<CreateCopyInput>) {
    return this.patch<CopyRecord>(`/api/library/copies/${id}`, data);
  }

  bulkImportCatalogues(data: CreateCatalogueInput[]) {
    return this.post<{ created: number; errors: string[] }>('/api/library/catalogue/bulk', { records: data });
  }

  // ── Circulation ───────────────────────────────────────────────────────────

  evaluatePolicy(studentId: string, copyId: string) {
    return this.get<PolicyEvalResult>(`/api/library/policies/evaluate?studentId=${studentId}&copyId=${copyId}`);
  }

  borrow(data: BorrowInput) {
    return this.post<BorrowResult>('/api/library/circulate/borrow', data);
  }

  returnBook(data: ReturnInput) {
    return this.post<ReturnResult>('/api/library/circulate/return', data);
  }

  renew(borrowId: string) {
    return this.post<RenewResult>('/api/library/circulate/renew', { borrowId });
  }

  // ── Reservations ──────────────────────────────────────────────────────────

  getReservations(params?: { catalogueId?: string; studentId?: string; status?: string }) {
    const search = new URLSearchParams();
    if (params?.catalogueId) search.set('catalogueId', params.catalogueId);
    if (params?.studentId) search.set('studentId', params.studentId);
    if (params?.status) search.set('status', params.status);
    return this.get<ReservationRecord[]>(`/api/library/reservations?${search}`);
  }

  createReservation(data: CreateReservationInput) {
    return this.post<ReservationRecord>('/api/library/reservations', data);
  }

  fulfillReservation(reservationId: string, copyId: string) {
    return this.post<ReservationRecord>(`/api/library/reservations/${reservationId}/fulfill`, { copyId });
  }

  cancelReservation(reservationId: string, reason?: string) {
    return this.patch<ReservationRecord>(`/api/library/reservations/${reservationId}/cancel`, { reason });
  }

  // ── Fines ─────────────────────────────────────────────────────────────────

  getOverdueList(params?: { q?: string; page?: number }) {
    const search = new URLSearchParams();
    if (params?.q) search.set('q', params.q);
    if (params?.page) search.set('page', params.page.toString());
    return this.get<OverdueListResult>(`/api/library/fines/overdue?${search}`);
  }

  pauseFine(studentId: string, reason: string) {
    return this.post<{ ok: boolean }>('/api/library/fines/pause', { studentId, reason });
  }

  resumeFine(studentId: string) {
    return this.post<{ ok: boolean }>('/api/library/fines/resume', { studentId });
  }

  markFinePaid(cardId: string, amount: number, reason: string) {
    return this.post<{ ok: boolean; balanceAfter: number }>('/api/library/fines/pay', {
      cardId, amount, reason,
    });
  }

  // ── Settings ──────────────────────────────────────────────────────────────

  getSettings() {
    return this.get<LibrarySettingsRecord>('/api/library/settings');
  }

  updateSettings(data: Partial<LibrarySettingsRecord>) {
    return this.patch<LibrarySettingsRecord>('/api/library/settings', data);
  }

  getPolicies() {
    return this.get<LibraryPolicyRecord[]>('/api/library/policies');
  }

  updatePolicy(id: string, data: Partial<LibraryPolicyRecord>) {
    return this.patch<LibraryPolicyRecord>(`/api/library/policies/${id}`, data);
  }

  // ── Analytics ─────────────────────────────────────────────────────────────

  getAnalytics() {
    return this.get<LibraryAnalytics>('/api/library/analytics');
  }
}

// ── Error class ───────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly data?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  role: 'PRINCIPAL' | 'ADMIN_STAFF' | 'TEACHER' | 'STUDENT';
  schoolId: string;
  staffRoleId?: string;
}

export interface StudentHit {
  id: string;
  fullName: string;
  admissionNumber: string;
  schoolClass: { name: string; form: number; stream?: string | null };
  libraryCard: { id: string; fineBalance: number; status: string } | null;
  files?: { id: string }[];
}

export interface CardDetail {
  student: {
    id: string;
    fullName: string;
    admissionNumber: string;
    schoolClass: { name: string; form: number };
    files: { id: string }[];
  };
  card: {
    id: string;
    cardNumber: string | null;
    status: string;
    suspensionReason: string | null;
    fineBalance: number;
    totalFinesPaid: number;
    expiresAt: string | null;
    currentBorrowCount: number;
    totalBorrowCount: number;
    borrows: BorrowRow[];
  };
  settings: { maxBooksPerStudent: number; maxBorrowDays: number; finePerDay: number; maxRenewals: number };
}

export interface BorrowRow {
  id: string;
  borrowedAt: string;
  dueAt: string;
  returnedAt: string | null;
  renewalCount: number;
  fineAmount: number;
  copy?: { accessionNumber: string; catalogue?: { title: string; author: string | null } } | null;
}

export interface CatalogueRecord {
  id: string;
  title: string;
  bookNumber: string | null;
  subject: string | null;
  form: number | null;
  author: string | null;
  publisher: string | null;
  edition: string | null;
  isbn: string | null;
  category: string;
  shelf: string | null;
  language: string;
  totalCopies: number;
  createdAt: string;
  updatedAt: string;
  copies?: CopyRecord[];
}

export interface CatalogueWithCopies extends CatalogueRecord {
  copies: CopyRecord[];
  _count: { copies: number };
}

export interface CatalogueListResult {
  catalogues: CatalogueRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateCatalogueInput {
  title: string;
  bookNumber?: string;
  subject?: string;
  form?: number;
  author?: string;
  publisher?: string;
  edition?: string;
  isbn?: string;
  category?: string;
  shelf?: string;
  language?: string;
}

export interface CopyRecord {
  id: string;
  catalogueId: string;
  accessionNumber: string;
  qrCode: string | null;
  barcode: string | null;
  condition: string;
  status: string;
  acquisitionDate: string | null;
  cost: number | null;
  createdAt: string;
  catalogue?: { title: string; author: string | null };
}

export interface CreateCopyInput {
  catalogueId: string;
  accessionNumber: string;
  condition?: string;
  acquisitionDate?: string;
  cost?: number;
}

export interface PolicyEvalResult {
  allowed: boolean;
  reasons: string[];
  warnings: string[];
  policy: {
    maxBooksAllowed: number;
    borrowDays: number;
    finePerDay: number;
    maxRenewals: number;
  };
  dueAt: string;
  finePaused: boolean;
  card?: { fineBalance: number; currentBorrowCount: number; status: string };
  copy?: CopyRecord;
}

export interface BorrowInput {
  studentId: string;
  copyId: string;
  overrideReason?: string;
}

export interface BorrowResult {
  borrow: { id: string; dueAt: string };
  ok: boolean;
}

export interface ReturnInput {
  borrowId: string;
  returnType: string;
  returnCondition: string;
  notes?: string;
}

export interface ReturnResult {
  ok: boolean;
  totalFine: number;
  returnedAt: string;
}

export interface RenewResult {
  ok: boolean;
  newDueAt: string;
}

export interface ReservationRecord {
  id: string;
  catalogueId: string;
  reservationType: string;
  studentId: string | null;
  teacherId: string | null;
  status: string;
  queuePosition: number | null;
  expiresAt: string | null;
  createdAt: string;
  catalogue: { id: string; title: string; author: string | null };
  student?: { id: string; fullName: string; admissionNumber: string } | null;
}

export interface CreateReservationInput {
  catalogueId: string;
  studentId: string;
  reservationType?: string;
  notes?: string;
}

export interface OverdueListResult {
  items: OverdueItem[];
  total: number;
}

export interface OverdueItem {
  borrowId: string;
  studentId: string;
  studentName: string;
  admissionNumber: string;
  title: string;
  accessionNumber: string;
  dueAt: string;
  overdueDays: number;
  fineAmount: number;
  cardStatus: string;
  finePaused: boolean;
}

export interface LibrarySettingsRecord {
  maxBooksPerStudent: number;
  maxBorrowDays: number;
  finePerDay: number;
  maxRenewals: number;
  identificationMethod: 'MANUAL' | 'QR_CAMERA' | 'QR_HARDWARE';
  barcodeEnabled: boolean;
  overdueAlertDays: number;
  gracePeriodDays?: number;
  countWeekends?: boolean;
  fineBlockThreshold?: number;
}

export interface LibraryPolicyRecord {
  id: string;
  patronType: string;
  label: string | null;
  maxBooksAllowed: number;
  borrowDays: number;
  gracePeriodDays: number;
  finePerDay: number;
  countWeekends: boolean;
  countHolidays: boolean;
  maxRenewals: number;
  fineBlockThreshold: number;
  reservationsAllowed: boolean;
  isActive: boolean;
}

export interface LibraryAnalytics {
  overview: {
    totalTitles: number;
    totalCopies: number;
    availableCopies: number;
    borrowedCopies: number;
    reservedCopies: number;
    overdueCount: number;
    activeCards: number;
    activeBorrowers: number;
  };
  fineKpis: {
    totalGenerated: number;
    totalOutstanding: number;
    totalPaid: number;
  };
  conditionDistribution: Array<{ condition: string; count: number }>;
  borrowTrend: Array<{ date: string; borrows: number; returns: number }>;
  topBorrowers: Array<{
    studentId: string;
    studentName: string;
    admissionNumber: string;
    borrowCount: number;
    averageGrade?: number;
  }>;
  mostPopularTitles: Array<{ catalogueId: string; title: string; borrowCount: number }>;
  leastPopularTitles: Array<{ catalogueId: string; title: string; borrowCount: number }>;
  neverBorrowedCount: number;
}

export const api = new ApiClient();
