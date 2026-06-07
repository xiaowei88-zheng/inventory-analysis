# Project Rules

## Purpose

This project is a local inventory and sales analysis tool for uploaded Excel files.

## Directory Structure

- `server/`: Node.js backend, import pipeline, analysis rules, tests.
- `public/`: Static frontend assets served by the backend.
- `data/`: Runtime analysis results and exported reports.
- `uploads/`: Uploaded Excel files.
- `outputs/`: User-facing deliverables created by Codex.

## Naming

- Use English for code symbols, file names, API fields, and commands.
- Keep business labels in Chinese where they are visible to users.
- Use camelCase for JavaScript variables and API JSON fields.
- Use kebab-case for frontend CSS classes and static asset names.

## Engineering Rules

- Keep changes scoped to the requested tool.
- Do not introduce unrelated refactors or formatting churn.
- Do not store secrets in source files, logs, uploads, or exports.
- Large Excel files must be processed on the backend; the frontend must not load the full workbook.

## Validation

- Run `npm test` after changing analysis logic.
- Run `npm run check` before delivery.
- For UI changes, start the server and verify the page loads at `http://localhost:3000`.
