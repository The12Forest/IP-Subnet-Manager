# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added
- Initial release
- Setup wizard for first-launch configuration (network, subnet, admin account)
- Subnet management — create, edit, delete, reorder
- Host management — add, edit, delete with IP validation against subnet range
- Live container status checking via TCP port or ICMP ping
- Background status checker with configurable interval
- SSE live status updates — online/offline dots update without page refresh
- Built-in MCP server on port 3001 (Streamable HTTP transport)
- MCP tools: list/add/update/remove subnets and hosts, search, check status, audit log
- User management with admin / editor / viewer roles
- Dark mode by default, light mode toggle (saved to localStorage)
- Audit log for all create/update/delete operations
- JSON and Markdown export
- JSON bulk import
- Setup wizard protection — replays complete guard (409 on duplicate submit)
- HTTPS support: off / self-signed / custom certificate modes
- Environment variable overrides for all settings with UI lock indicator
- Docker support — single container, data directory volume-mounted
- GitHub Actions CI/CD for automatic GHCR image publishing
