# Project Vision & Architectural Overview

> **Where the real docs live:** this file is the constitution — short on purpose.
> The detailed specs live in [`docs/`](docs/README.md); start at
> [`docs/architecture.md`](docs/architecture.md). Sub-agents are wired in
> [`.claude/agents/`](.claude/agents/) and the git workflow is in
> [`docs/branching-strategy.md`](docs/branching-strategy.md).

## 1. Core Vision
An automated logistical quoting pipeline that maps dimensions, optimizes 3D space configuration inside fleet vans, tracks transit routing via Google Maps API, and dynamically calculates client costs using preset mileage rates.

## 2. Core Constraints & Engineering Rules
* **Hyper-Modular codebase following best coding design practices** - MRMR, loose coupling, high cohesion, SRP, NEVER hardcode! NEVER overengineer!
* **Design System:** All colors via CSS custom properties in `src/app/globals.css :root`. No hardcoded hex anywhere in `src/`. Palette and component patterns in [`docs/design-system.md`](docs/design-system.md). Visual reference (Moverta aesthetic) in [`docs/ui-reference.md`](docs/ui-reference.md).
* **Plan & Execute in Micro-Steps:** Break every feature down into independent milestones.
* **Never Guess. Always Prove:** Every calculation and function must be systematically verified.
* **UI:** All features must have visual testing capability for dev
* **Strict Git Discipline:** Every milestone requires its own dedicated branch. No direct pushes to main.

## 3. System Architecture & Multi-Agent Matrix
Development utilizes Anthropic Claude Code frameworks, driving three specialized sub-agents:
* **Architect Agent:** Validates module boundaries, data ingestion flow, and 3D geometric math models.
* **Design Agent:** Oversees UI components, preset selectors, and 3D calculation visualizations.
* **Security Agent:** Scans code for vulnerabilities and ensures private keys (e.g., Google Maps API) remain secured.

## 4. End-to-End Execution Roadmap
* **ML-0:** Core Rules Setup (`Cloud.md`)
* **ML-1:** Admin Dashboard: Fleet Van Presets (Dimensions, Widths) & Base Per-Mile Rates.
* **ML-2:** Core Processor: Cargo Data Ingestion, Classification, & 3D Volume Calculation Engine.
* **ML-3:** Visualization: Front-end 3D Space Render & Interactive Layout Display.
* **ML-4:** Logistics: Google Maps API Routing integration & dynamic price quotation output.