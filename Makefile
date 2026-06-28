.PHONY: build test lint fmt fix dev-up dev-down publish-module help

BIN := .venv/bin
PYTHON := $(BIN)/python3 || python3

# ── Help ────────────────────────────────────────────────────────────────
help:  ## Show available targets
	@echo "SpacetimeTV — Development Commands"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ── Backend ─────────────────────────────────────────────────────────────
build:  ## Build everything (install deps, build frontend)
	cd server && pip install -r requirements.txt
	cd web && npm install && npm run build

test:  ## Run all tests (backend + frontend, offline-safe)
	cd web && npm test
	cd server && python3 -m pytest tests/ -v -x --ignore=tests/test_live.py 2>/dev/null || python -m pytest tests/ -v -x --ignore=tests/test_live.py

test-backend:  ## Run backend tests only
	cd server && python3 -m pytest tests/ -v --ignore=tests/test_live.py 2>/dev/null || python -m pytest tests/ -v --ignore=tests/test_live.py

test-frontend:  ## Run frontend tests only
	cd web && npm test

test-all: test-backend test-frontend  ## Run full test suite

lint:  ## Lint backend (Python) and frontend (TypeScript)
	cd server && python3 -m flake8 --statistics 2>/dev/null || echo "Install flake8 for Python linting"
	cd web && npx tsc --noEmit 2>/dev/null || echo "TypeScript type checking needs npx tsc"

fmt:  ## Format all code
	cd server && python3 -m black . 2>/dev/null || echo "Install black for Python formatting"
	cd web && npx prettier --write src/ 2>/dev/null || echo "Install prettier for TS formatting"

fix: lint fmt  ## Fix all auto-fixable issues

# ── Dev Environment ─────────────────────────────────────────────────────
dev-up:  ## Start development environment
	@echo "Starting backend on :8720..."
	cd server && python3 main.py &
	@sleep 2
	@echo "Starting frontend on :5183..."
	cd web && npm run dev &
	@echo ""
	@echo "Backend:  http://localhost:8720"
	@echo "Frontend: http://localhost:5183"

dev-down:  ## Stop development servers
	-pkill -f "python3 main.py" 2>/dev/null; echo "Backend stopped"
	-pkill -f "vite" 2>/dev/null; echo "Frontend stopped"

# ── Docker ──────────────────────────────────────────────────────────────
docker-build:  ## Build Docker images
	docker compose build

docker-up:  ## Start all services via docker-compose
	docker compose up -d
	@echo "Frontend: http://localhost:8722"

docker-down:  ## Stop all services
	docker compose down

# ── Cleanup ─────────────────────────────────────────────────────────────
clean:  ## Clean build artifacts
	rm -rf web/dist
	rm -rf server/__pycache__ server/routes/__pycache__ server/tests/__pycache__
	rm -rf .coverage .pytest_cache
	find . -name '*.pyc' -delete
	find . -name '*.pyo' -delete
