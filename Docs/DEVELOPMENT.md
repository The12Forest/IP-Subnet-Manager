# Development Guide

This guide explains how to run the Subnet Manager for local development without using Docker.

## Prerequisites

-   Node.js (v20.x or compatible)
-   A terminal or command prompt

## Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/YOUR_USERNAME/subnet-manager.git
    cd subnet-manager
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Create `.env` file:**
    Copy `.env.example` to `.env` and fill in the required variables, especially `JWT_SECRET`.
    ```bash
    cp .env.example .env
    ```

## Running the Server

To run the server with automatic reloading on file changes (recommended), use the `dev` script:
```bash
npm run dev
```
This uses `nodemon` to watch for changes in the `Backend/` directory.

Alternatively, you can run the server directly:
```bash
node Backend/server.js
```

The application will be available at `http://localhost:3000`.

## Database

The SQLite database file is located at `Backend/data/subnet-manager.db`. To reset the database, simply delete this file and restart the server. The application will re-create the database and trigger the setup wizard on the next page load.
