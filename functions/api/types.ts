export interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run(): Promise<{ success: boolean; meta: any; error?: string }>;
  all<T = unknown>(): Promise<{ results?: T[]; success: boolean; meta: any; error?: string }>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  dump(): Promise<ArrayBuffer>;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<Array<{ results?: T[]; success: boolean; error?: string }>>;
  exec(query: string): Promise<{ count: number; duration: number }>;
}

export interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  ROOT_EMAIL?: string;
  RESEND_API_KEY?: string;
}

export interface UserSession {
  id: string;
  email: string;
  fullName: string;
  role: string;
  primaryInstitutionId?: string | null;
  institutionId?: string | null;
  institutionName?: string | null;
  roles?: string[];
  permissions?: string[];
  isRoot?: boolean;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
