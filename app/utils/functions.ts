import type { Response } from 'express';
import { YAHOO_TO_BACKEND_TEAM_MAP } from './constants';

// slotFilter.ts
export function slotWhereClause(pos?: string): { clause: string; params: any[] } {
    if (!pos) return { clause: "", params: [] };
    const p = pos.toUpperCase();
  
    switch (p) {
      case "C": return { clause: " AND pl.is_c = 1", params: [] };
      case "1B": return { clause: " AND pl.is_1b = 1", params: [] };
      case "2B": return { clause: " AND pl.is_2b = 1", params: [] };
      case "3B": return { clause: " AND pl.is_3b = 1", params: [] };
      case "SS": return { clause: " AND pl.is_ss = 1", params: [] };
      case "OF": return { clause: " AND pl.is_of = 1", params: [] };
      case "UTIL": return { clause: " AND pl.position = 'B'", params: [] };
      case "SP": return { clause: " AND pl.is_sp = 1", params: [] };
      case "RP": return { clause: " AND pl.is_rp = 1", params: [] };
      case "P": return { clause: " AND pl.position = 'P'", params: [] };
      default:
        // unknown slot code -> ignore
        return { clause: "", params: [] };
    }
}

export function normalisedName(name: string): string {
    return name
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // Remove accents
        .replace(/[^\w\s]/gi, '')                          // Remove punctuation
        .toLowerCase()
        .trim();
}

// Function to convert Yahoo team abbreviation to backend abbreviation
export function convertYahooTeamAbbr(yahooAbbr: string): string | null {
    if (!yahooAbbr) return null;
    return YAHOO_TO_BACKEND_TEAM_MAP[yahooAbbr as keyof typeof YAHOO_TO_BACKEND_TEAM_MAP] || yahooAbbr as string;
}


// Helper functions for consistent responses
export function sendSuccess(res: Response, data: any, message = 'Success'): void {
    res.json({
        success: true,
        message,
        data
    });
};

export function sendError(res: Response, statusCode: number, message: string): void {
    res.status(statusCode).json({
        success: false,
        error: message
    });
};

// Parsing / validation helpers
export function parseNumber(value: unknown, field: string): number | null | undefined {
    if (value === undefined || value === null || value === '') {
        return null;
    }
    const num = typeof value === 'string' ? Number(value) : Number(value);
    if (Number.isNaN(num)) {
        throw new Error(`${field} must be a valid number`);
    }
    return num;
}

/** Like parseNumber but throws if value is null/undefined/empty. Use when the field is required. */
export function parseNumberRequired(value: unknown, field: string): number {
    const n = parseNumber(value, field);
    if (n == null) throw new Error(`${field} is required`);
    return n;
}

export function parseOptionalYear(value: unknown, field: string): number | null | undefined {
    if (value === undefined || value === null || value === '') {
        return null;
    }
    const year = parseNumber(value, field);
    return year;
}

export function parseBoolean(value: unknown, defaultValue: boolean): boolean {
    if (value === undefined || value === null || value === '') {
        return defaultValue;
    }
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'string') {
        const lower = value.toLowerCase();
        if (lower === 'true') return true;
        if (lower === 'false') return false;
    }
    return Boolean(value);
}

/** Strict boolean parser: only accepts boolean or string 'true'/'false'. Throws otherwise. */
export function parseBooleanStrict(value: unknown, field: string): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const lower = value.toLowerCase();
        if (lower === 'true') return true;
        if (lower === 'false') return false;
    }
    throw new Error(`${field} must be true or false`);
}

export function parseStringOptional(value: unknown, field: string): string | null | undefined {
    if (value === undefined || value === null || value === '') {
        return null;
    }
    return parseString(value, field);
}

export function parseString(value: unknown, field: string): string {
    if (value === undefined || value === null) {
        throw new Error(`${field} is required`);
    }
    return String(value).trim();
}

export function parseDate(value: unknown, field: string): Date {
    if (value === undefined || value === null) {
        throw new Error(`${field} is required`);
    }
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) throw new Error(`${field} must be a valid date`);
        return value;
    }
    const d = typeof value === 'string' || typeof value === 'number' ? new Date(value) : new Date(NaN);
    if (Number.isNaN(d.getTime())) {
        throw new Error(`${field} must be a valid date`);
    }
    return d;
}

export function parseJsonArray(value: unknown, field: string): any[] {
    if (typeof value !== 'string') {
        throw new Error(`${field} must be a JSON string`);
    }
    try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) {
            throw new Error(`${field} must be a JSON array`);
        }
        return parsed;
    } catch {
        throw new Error(`${field} must be valid JSON`);
    }
}
