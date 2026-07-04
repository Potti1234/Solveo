.PHONY: install dev test backend frontend

install:
	cd backend && python -m pip install -r requirements.txt
	cd frontend && npm install

dev:
	cd backend && python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 & cd frontend && npm run dev -- --hostname 0.0.0.0 --port 3000

backend:
	cd backend && python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

frontend:
	cd frontend && npm run dev -- --hostname 0.0.0.0 --port 3000

test:
	cd backend && python -m pytest tests
