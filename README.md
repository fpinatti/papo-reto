# WhatsApp AI Group Summarizer

A secure, premium, and beautiful internal web application that links to your WhatsApp account (via QR code), displays your groups, and generates AI-powered structured summaries of recent chat messages (debates, news, links, Q&As, tools) using Google Gemini.

It stores synchronized messages and generated summaries in a local SQLite database to prevent double-processing and save Gemini API token costs.

---

## Features

- **WhatsApp Web Integration**: Scan a QR code in the browser to establish a connection. Auto-save session credentials locally so you don't scan every time.
- **AI-Powered Digest**: Uses Gemini to synthesize and structure conversations into distinct groups: *Executive Summary*, *Top Discussions*, *Shared Links*, *Key Q&As*, and *Tools Mentioned*.
- **Duplicate Prevention**: Syncs WhatsApp group messages to a local SQLite database and marks them as summarized. Future summaries will only query new, unprocessed messages.
- **Premium Glassmorphic UI**: Vibrant, responsive dark-mode dashboard styled with Google Fonts and micro-animations.
- **Secure Architecture**:
  - Secure session cookie management.
  - Binds strictly to `127.0.0.1` locally by default.
  - Generates secure session passwords and CSRF tokens to prevent clickjacking and session takeover.
  - Complete XSS prevention via local `marked` parsing sanitized by `DOMPurify`.

---

## Prerequisites

This app runs on Node.js (version 18 or higher is recommended) and uses Puppeteer under the hood to run a headless Chromium instance.

### Linux System Libraries (Required)
If you are running this on a Linux machine (especially headless servers like Debian/Ubuntu), Puppeteer requires several system libraries to execute Chromium. Run the following command in your terminal before installation:

```bash
sudo apt-get update && sudo apt-get install -y \
  libgconf-2-4 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libgdk-pixbuf2.0-0 \
  libgtk-3-0 \
  libgbm-dev \
  libnss3-dev \
  libxss-dev \
  libasound2 \
  libxshmfence-dev \
  libglu1-mesa
```

---

## Setup Instructions

1. **Install Dependencies**
   Navigate to the directory and run:
   ```bash
   npm install
   ```

2. **Configure Environment Variables**
   Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
   Open the newly created `.env` file in your editor and configure:
   - `GEMINI_API_KEY`: Enter your Google Gemini API Key.
   - `APP_PASSWORD`: Change the default `admin123` password to something secure. This password is required to log into the web dashboard.
   - `SESSION_SECRET`: Change this to a random secure secret.

3. **Start the Application**
   Run the startup script:
   ```bash
   npm start
   ```

4. **Access the Dashboard**
   - Open your browser and navigate to: [http://localhost:3000](http://localhost:3000)
   - Log in using the password configured in your `.env` file.
   - The WhatsApp Web QR code will be displayed. Open WhatsApp on your phone, go to **Settings > Linked Devices > Link a Device**, and scan the QR code.
   - Once connected, your group chats list will load in the sidebar.

---

## How It Works (Duplicate Processing Prevention)

When you select a WhatsApp group and choose a time range (e.g. 24 hours) to summarize:
1. The backend fetches messages for that period from WhatsApp.
2. It writes new messages to a local SQLite database (`whatsapp_summarizer.db`). If a message has already been written, it skips it (based on the WhatsApp message ID).
3. The server selects all messages for the group and time range that are marked `is_summarized = 0`.
4. These unsummarized messages are sent to Gemini for summarization.
5. Once the summary is successfully generated, those messages are marked as `is_summarized = 1` in the database.
6. The summary is saved under **Past Summaries** and rendered to your dashboard.
7. Next time you trigger a summary, only messages received *after* the previous summary will be sent to Gemini, saving costs and preventing redundant text in your summaries.
# papo-reto
