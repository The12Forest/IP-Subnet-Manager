# Subnet Manager

**Self-hosted subnet & IP management dashboard with built-in MCP server.**

![License](https://img.shields.io/badge/license-CC%20BY--NC--SA%204.0-blue)
![Node.js](https://img.shields.io/badge/node-20.x-green)
![Docker](https://img.shields.io/badge/docker-ready-blue)

Subnet Manager is a simple, self-hosted, and intuitive application for managing IP addresses and subnets within your network. It's designed for homelab enthusiasts and small-scale network administrators who need a clear, at-a-glance view of their IP allocation.

## Features
- **Intuitive Dashboard**: Clean, card-based layout to visualize your subnets.
- **Live Status Checking**: Automatic TCP/ICMP checks to see which hosts are online.
- **Dark/Light Mode**: User-selectable theme preference.
- **User Management**: Three roles (admin, editor, viewer) to control access.
- **Audit Log**: Track all changes made to hosts, subnets, and users.
- **Export/Import**: Backup and restore your data with JSON import/export.
- **MCP Server**: Built-in Claude.ai MCP server for remote management.
- **HTTPS Support**: Secure your instance with self-signed or custom SSL certificates.

## Screenshots
![Dashboard](Docs/screenshots/dashboard.png)

## Quick Start
1.  Clone this repository.
2.  Copy `.env.example` to `.env` and generate a long random string for `JWT_SECRET`.
3.  Run `docker compose up -d`.
4.  Open `http://localhost:3000` in your browser and complete the setup wizard.

## Deployment
You can deploy Subnet Manager by either pulling the pre-built image from GitHub Container Registry or by building it locally.
-   **Pull image (recommended)**: Use `docker-compose.yml`.
-   **Build locally**: Use `docker-compose.build.yml`.

See `Docs/SETUP.md` for detailed instructions.

## Environment Variables
The application is highly configurable via environment variables. See the full list and their descriptions in `Docs/SETUP.md`.

## MCP Integration
A built-in MCP server runs on port 3001 (by default). For details on how to connect and use the available tools, please see `Docs/MCP.md`.

## Documentation
-   [Setup Guide](Docs/SETUP.md)
-   [API Reference](Docs/API.md)
-   [MCP Protocol](Docs/MCP.md)
-   [Development Guide](Docs/DEVELOPMENT.md)
-   [Architecture Overview](Docs/ARCHITECTURE.md)

## Contributing
Contributions are welcome! Please read `CONTRIBUTING.md` for details on how to submit bug reports, feature requests, and pull requests.

## License
This project is licensed under the **Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License**. See the `LICENSE` file for details. This means it is free for personal and non-commercial use, but you must share any modifications under the same license.
