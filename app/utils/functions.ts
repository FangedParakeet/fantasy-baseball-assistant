import type { Response } from 'express';
import { YAHOO_TO_BACKEND_TEAM_MAP } from './constants';

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

  