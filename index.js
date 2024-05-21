import express from 'express';
import { google } from 'googleapis';
import { PublicClientApplication } from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';
import OpenAI from 'openai';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import fs from 'fs';
import readline from 'readline';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send'];
const TOKEN_PATH = 'token.json';

const googleCredentials = {
  client_id: process.env.GOOGLE_CLIENT_ID,
  client_secret: process.env.GOOGLE_CLIENT_SECRET,
  redirect_uris: [process.env.GOOGLE_REDIRECT_URI],
};

const outlookCredentials = {
  clientId: process.env.OUTLOOK_CLIENT_ID,
  clientSecret: process.env.OUTLOOK_CLIENT_SECRET,
  tenantId: process.env.OUTLOOK_TENANT_ID,
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const connection = new IORedis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// Initialize OAuth2 client for Google
const oAuth2Client = new google.auth.OAuth2(
    googleCredentials.client_id,
    googleCredentials.client_secret,
    googleCredentials.redirect_uris[0]
  );
  
  // Function to get Google access token
  function getGoogleAccessToken(oAuth2Client, res) {
    const authUrl = oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES });
    console.log('Authorize this app by visiting this URL:', authUrl);
    res.redirect(authUrl);
  }
  
  // OAuth2 Client Initialization for Google
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) {
      console.log('Token not found, requiring authentication');
    } else {
      oAuth2Client.setCredentials(JSON.parse(token));
      console.log('OAuth2 client initialized');
    }
  });
  
  // Function to authorize Google
  function authorizeGoogle(callback) {
    if (!oAuth2Client.credentials || !oAuth2Client.credentials.access_token) {
      console.log('OAuth2 client not initialized');
      return callback(new Error('OAuth2 client not initialized'));
    }
    callback(null, oAuth2Client);
  }
  
  // Function to handle Google OAuth2 callback
  app.get('/auth/google/callback', (req, res) => {
    const code = req.query.code;
    oAuth2Client.getToken(code, (err, token) => {
      if (err) {
        console.error('Error retrieving access token', err);
        return res.status(400).send('Authentication failed');
      }
      oAuth2Client.setCredentials(token);
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
      console.log('Token stored to', TOKEN_PATH);
      res.send('Authentication successful! You can close this window.');
    });
  });