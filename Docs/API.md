# REST API Reference

All endpoints are prefixed with `/api/v1`.

## Auth

-   `POST /auth/login`: Authenticate and receive an `httpOnly` JWT cookie.
-   `POST /auth/logout`: Clear the authentication cookie.
-   `GET /auth/me`: Get information about the currently logged-in user. (Requires auth)

## Setup

-   `GET /setup/status`: Check if the application has been configured.
-   `POST /setup/run`: Run the initial setup (create admin user, save settings).

## Users (Admin Only)

-   `GET /users`: List all users.
-   `POST /users`: Create a new user.
-   `PUT /users/:id`: Update a user. (Not yet implemented)
-   `DELETE /users/:id`: Delete a user.

## Settings (Admin Only)

-   `GET /settings`: Get all application settings.
-   `PUT /settings`: Bulk-update application settings.

## Subnets

-   `GET /subnets`: List all subnets. (Requires auth)
-   `POST /subnets`: Create a new subnet. (Editor+)
-   `PUT /subnets/:id`: Update a subnet. (Editor+, Not yet implemented)
-   `DELETE /subnets/:id`: Delete a subnet. (Admin only)

## Hosts

-   `GET /subnets/:subnet_id/hosts`: List all hosts within a subnet. (Requires auth)
-   `POST /subnets/:subnet_id/hosts`: Create a new host. (Editor+)
-   `PUT /hosts/:id`: Update a host. (Editor+, Not yet implemented)
-   `DELETE /hosts/:id`: Delete a host. (Editor+)
-   `POST /hosts/:id/check`: Trigger a manual status check for a single host. (Requires auth)

## Status

-   `GET /status`: Get the last known status of all hosts. (Requires auth)
-   `POST /status/check-all`: Trigger a manual status check for all hosts. (Requires auth)

## Audit Log (Admin Only)

-   `GET /audit`: Get a paginated and filterable list of all audit log entries.

## Data Management

-   `GET /export/json`: Export the database contents as a JSON file. (Requires auth)
-   `POST /import/json`: Import data from a JSON file. (Admin only, Not yet implemented)
