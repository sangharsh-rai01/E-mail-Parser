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