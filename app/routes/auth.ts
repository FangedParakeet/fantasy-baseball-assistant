import express, { Request, Response } from 'express';
import Token from '../classes/token';
import YahooOAuth from '../classes/yahooOAuth';
import { db } from '../db/db';
import { sendSuccess, sendError } from '../utils/functions';
import TokenController from '../controllers/tokenController';
import type { TokenResponse } from '../controllers/tokenController';
import type { AccessToken } from '../classes/token';

const router = express.Router();
const token = new Token(db);
const yahooOAuth = new YahooOAuth();
const tokenController = new TokenController(token, yahooOAuth);

// Get current token status
router.get('/token-status', async (req: Request, res: Response) => {
  try {
    const status: TokenResponse = await tokenController.getStatus();
    sendSuccess(res, status, 'Token status retrieved successfully');
  } catch (error) {
    console.error('Token status error:', error);
    sendError(res, 500, 'Failed to get token status');
  }
});

// OAuth login redirect
router.get('/login', async (req: Request, res: Response) => {
  try {
    const authUrl: string = tokenController.getAuthUrl();
    res.redirect(authUrl);
  } catch (error) {
    console.error('Login error:', error);
    sendError(res, 500, 'Failed to generate auth URL');
  }
});

// OAuth redirect handler
router.get('/redirect', async (req: Request, res: Response) => {
  try {
    const { code } = req.query;
    
    if (!code) {
      return sendError(res, 400, 'Authorization code required');
    }

    // Exchange code for tokens
    await tokenController.exchangeCodeForToken(code as string);
    console.log('Tokens stored in database successfully');

    // Redirect to frontend with success
    res.redirect(`https://${process.env.SITE_DOMAIN}/?oauth=success`);
  } catch (error) {
    console.error('OAuth redirect error:', error);
    sendError(res, 500, 'OAuth authentication failed');
  }
});

// Refresh Yahoo token
router.post('/refresh-token', async (req: Request, res: Response) => {
  try {
    await tokenController.refreshToken();
    sendSuccess(res, { message: 'Token refreshed successfully' }, 'Token refreshed successfully');
  } catch (error) {
    console.error('Token refresh error:', error);
    sendError(res, 500, 'Token refresh failed');
  }
});

// Get access token (for API calls)
router.get('/access-token', async (req: Request, res: Response) => {
  try {
    const token: AccessToken = await tokenController.getToken();
    sendSuccess(res, { access_token: token.access_token }, 'Access token retrieved successfully');
  } catch (error) {
    console.error('Get access token error:', error);
    sendError(res, 500, 'Failed to get access token');
  }
});

export default router;
