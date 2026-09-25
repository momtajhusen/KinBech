.PHONY: run dev install stop start-mongodb stop-mongodb wait-backend

run: stop start-mongodb
	@echo "🚀 Starting Backend..."
	@cd Backend && npm run dev &
	@$(MAKE) wait-backend
	@echo "🚀 Starting Website (with Admin)..."
	@cd Website && npm run dev &
	@echo "✅ Website: http://localhost:5180"
	@echo "✅ Admin login: http://localhost:5180/admin/login"
	@echo "✅ Backend: http://localhost:5001"
	@echo "Press Ctrl+C to stop both servers (or run: make stop)"

wait-backend:
	@echo "⏳ Waiting for Backend on :5001..."
	@i=0; \
	while [ $$i -lt 40 ]; do \
		if curl -sf http://127.0.0.1:5001/health >/dev/null 2>&1; then \
			echo "✅ Backend is ready"; \
			exit 0; \
		fi; \
		i=$$((i+1)); \
		sleep 0.5; \
	done; \
	echo "❌ Backend did not become ready on :5001"; \
	exit 1

dev: run

install:
	@echo "📦 Installing dependencies..."
	@cd Backend && npm install
	@cd Mobile && npm install
	@cd Website && npm install

website:
	@echo "🌐 Starting public website..."
	@cd Website && npm run dev

start-mongodb:
	@echo "Starting MongoDB..."
	@if ! lsof -iTCP:27017 -sTCP:LISTEN >/dev/null 2>&1; then \
		mongod --config /opt/homebrew/etc/mongod.conf --fork --logpath /tmp/mongodb.log >/dev/null 2>&1; \
		echo "MongoDB started on port 27017"; \
	else \
		echo "MongoDB already running on port 27017"; \
	fi

stop-mongodb:
	@echo "Stopping MongoDB..."
	@if lsof -iTCP:27017 -sTCP:LISTEN >/dev/null 2>&1; then \
		pkill -f mongod || true; \
		echo "MongoDB stopped"; \
	else \
		echo "MongoDB not running"; \
	fi

stop:
	@echo "Stopping Website and Backend..."
	@-pkill -f "nodemon src/server.js" 2>/dev/null || true
	@-pkill -f "kinbech-backend" 2>/dev/null || true
	@-pkill -f "vite" 2>/dev/null || true
	@-lsof -tiTCP:5001 -sTCP:LISTEN | xargs kill -9 2>/dev/null || true
	@-lsof -tiTCP:5180 -sTCP:LISTEN | xargs kill -9 2>/dev/null || true
	@-lsof -tiTCP:5181 -sTCP:LISTEN | xargs kill -9 2>/dev/null || true
	@echo "Servers stopped"
