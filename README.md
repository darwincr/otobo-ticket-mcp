# OTOBO Ticket MCP

An MCP (Model Context Protocol) server for OTOBO ticket operations.

This project exposes ticket and customer tools over stdio so MCP clients can:

- Create, update, and retrieve tickets
- Search tickets and fetch ticket history
- Resolve ticket IDs from ticket numbers
- Discover valid queues, states, priorities, types, and agents
- Search and fetch customer user details

## Requirements

- Node.js 20+
- Access to an OTOBO GenericInterface REST webservice with the operations used by this server

## Installation

```bash
npm install
npm run build
```

## Configuration

Copy the example env file and set your own values:

```bash
cp .env.example .env
```

Required variables:

- `OTOBO_URL`
- `OTOBO_USER`
- `OTOBO_PASSWORD`

Optional variables:

- `OTOBO_DEFAULT_QUEUE` (default: `Raw`)
- `OTOBO_DEFAULT_TYPE` (default: `Request`)

## Run

```bash
npm run build
npm start
```

## Tests

Unit tests:

```bash
npm run test:unit
```

Full test suite (integration tests are opt-in):

```bash
npm test
```

Run integration tests intentionally:

```bash
RUN_INTEGRATION_TESTS=true npm run test:integration
```

## Available MCP Tools

- `TicketCreate`
- `TicketGet`
- `TicketGetByNumber`
- `TicketUpdate`
- `TicketSearch`
- `TicketOverview`
- `TicketHistoryGet`
- `CustomerUserSearch`
- `CustomerUserGet`
- `ListQueues`
- `ListStates`
- `ListPriorities`
- `ListTypes`
- `ListAgents`
- `GetTicketMetadata` (deprecated)

## Notes

- Keep `.env` private and never commit credentials.
- `otobo_config.json` is optional; it provides static hint values and is not required for API operation.

## Release Checklist

- Rotate any credentials that were ever committed during development.
- Confirm `.env`, `.vscode`, `node_modules`, `dist`, and `coverage` are ignored.
- Run `npm run build` and `npm test`.
- Verify `README.md`, `LICENSE`, and `package.json` metadata are correct.
- Tag a release after merge if you want versioned distribution.
