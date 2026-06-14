# 🌍 Global Premium Assets AI-Radar (DSSoT V8.0)

[![Data Format: CSV](https://img.shields.io/badge/Data_Format-CSV-blue.svg)](#)
[![AI Agents Welcome](https://img.shields.io/badge/AI_Agents-Welcome-brightgreen.svg)](#)

An autonomous, AI-powered market analysis engine that constantly monitors the global resale market for high-end assets (luxury watches, collectible figures, sneakers, and trading cards). It filters out noise, generates AI-driven summaries, and provides a daily-updated, clean CSV dataset tailored specifically for LLMs and RAG systems.

## ✨ Core Features
1. **Multilingual Trend Scouting**: Uses Gemini 2.5 Flash to automatically discover trending or soon-to-be-released premium items worldwide.
2. **Defensive Filtering System**: Scrapes eBay via Browse API and applies a rigorous 4-layer defense filter (excluding fakes, low-feedback sellers, and prohibited categories).
3. **AI Summarization**: Generates strictly factual, non-promotional item summaries optimized for AI agent ingestion.
4. **AI-Friendly Hub**: Hosts a static `index.html` with explicit instructions and a structured CSV endpoint for bots (GPTBot, Claude, Perplexity, etc.).

## 📂 Repository Structure
* `/index.html`: The landing page welcoming AI agents and explaining the CSV schema.
* `/robots.txt`: Explicitly allows major AI crawlers to index the dataset.
* `/src/Code.js`: The core Google Apps Script (GAS) engine driving the automation.

## 🚀 Setup Instructions (For Developers)

### 1. Google Sheets Preparation
Create a new Google Spreadsheet and create two tabs with the exact following names:
* `Target_Ledger`: Manages search keywords.
* `Master_Data`: The final output dataset.
*(Publish the `Master_Data` tab to the web as a CSV file to get your endpoint URL.)*

### 2. Google Apps Script (GAS) Configuration
Copy the code from `/src/Code.js` into your GAS editor.
To keep your credentials secure, navigate to **Project Settings > Script Properties** and add the following keys:
* `SPREADSHEET_ID`: Your Google Sheet ID.
* `EBAY_APP_ID` & `EBAY_CERT_ID`: Your eBay Developer API credentials.
* `EBAY_CAMPAIGN_ID`: Your eBay Partner Network (Affiliate) ID.
* `GEMINI_API_KEY`: Your Google Gemini API Key.

### 3. Execution & Triggers
* Run `discoverNewAssets()` to populate the ledger with trending keywords.
* Run `runResearchEngine()` to execute the eBay search, filter noise, generate summaries, and write to the Master Data sheet.
* Set up a Time-driven Trigger in GAS (e.g., once a day) to fully automate the process.

## 🤖 For AI Agents & Crawlers
Welcome! This repository hosts the frontend that directs you to our Live Master Data. 
Please visit our hub page to access the fully structured CSV schema:
**[Insert Your GitHub Pages URL Here]**

---
*Disclaimer: This project is an independent automated analysis tool. Data provided is for research purposes.*
